package cosmos

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	sdkerrors "cosmossdk.io/errors"
	sdkmath "cosmossdk.io/math"
	"cosmossdk.io/simapp/params"
	abcitypes "github.com/cometbft/cometbft/abci/types"
	cometbftjson "github.com/cometbft/cometbft/libs/json"
	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	rpctypes "github.com/cometbft/cometbft/rpc/jsonrpc/types"
	cometbfttypes "github.com/cometbft/cometbft/types"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
	ibcchanneltypes "github.com/cosmos/ibc-go/v10/modules/core/04-channel/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/shared/cosmossdk"
)

func (c *HTTPClient) GetTx(txid string) (*coretypes.ResultTx, error) {
	res := &rpctypes.RPCResponse{}

	if !strings.HasPrefix(txid, "0x") {
		txid = "0x" + txid
	}

	_, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParam("hash", txid).Get("/tx")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx: %s", txid)
	}

	if res.Error != nil {
		return nil, errors.Wrapf(errors.New(res.Error.Error()), "failed to get tx: %s", txid)
	}

	tx := &coretypes.ResultTx{}
	if err := cometbftjson.Unmarshal(res.Result, tx); err != nil {
		return nil, errors.Errorf("failed to unmarshal tx result: %v: %s", res.Result, res.Error.Error())
	}

	return tx, nil
}

func (c *HTTPClient) TxSearch(query string, page int, pageSize int) (*coretypes.ResultTxSearch, error) {
	res := &rpctypes.RPCResponse{}

	queryParams := map[string]string{
		"query":    query,
		"page":     strconv.Itoa(page),
		"per_page": strconv.Itoa(pageSize),
		"order_by": "\"desc\"",
	}

	_, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParams(queryParams).Get("/tx_search")
	if err != nil {
		return nil, errors.Wrap(err, "failed to search txs")
	}

	if res.Error != nil {
		if strings.Contains(res.Error.Data, "page should be within") {
			return &coretypes.ResultTxSearch{Txs: []*coretypes.ResultTx{}, TotalCount: 0}, nil
		}
		return nil, errors.Wrap(errors.New(res.Error.Error()), "failed to search txs")
	}

	result := &coretypes.ResultTxSearch{}
	if err := cometbftjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal tx search result: %v", res.Result)
	}

	return result, nil
}

func (c *HTTPClient) BroadcastTx(rawTx string) (string, error) {
	txBytes, err := base64.StdEncoding.DecodeString(rawTx)
	if err != nil {
		return "", errors.Wrapf(err, "failed to decode rawTx: %s", rawTx)
	}

	var res struct {
		TxResponse struct {
			Height    int64               `json:"height,string"`
			TxHash    string              `json:"txhash"`
			Codespace string              `json:"codespace"`
			Code      uint32              `json:"code"`
			Data      string              `json:"data"`
			RawLog    string              `json:"raw_log"`
			Logs      sdk.ABCIMessageLogs `json:"logs"`
			Tx        *codectypes.Any     `json:"tx"`
			Info      string              `json:"info"`
			GasWanted int64               `json:"gas_wanted,string"`
			GasUsed   int64               `json:"gas_used,string"`
			Timestamp string              `json:"timestamp"`
		} `json:"tx_response"`
	}

	_, err = c.LCD.R().SetBody(&txtypes.BroadcastTxRequest{TxBytes: txBytes, Mode: txtypes.BroadcastMode_BROADCAST_MODE_SYNC}).SetResult(&res).Post("/cosmos/tx/v1beta1/txs")
	if err != nil {
		return "", errors.Wrap(err, "failed to broadcast transaction")
	}

	if res.TxResponse.Code != 0 {
		message := fmt.Sprintf("failed to broadcast transaction: codespace: %s, code: %d, description", res.TxResponse.Codespace, res.TxResponse.Code)
		return "", sdkerrors.ABCIError(res.TxResponse.Codespace, res.TxResponse.Code, message)
	}

	return res.TxResponse.TxHash, nil
}

func ParseEvents(txResult abcitypes.ExecTxResult) cosmossdk.EventsByMsgIndex {
	events := make(cosmossdk.EventsByMsgIndex)

	if txResult.Log != "" {
		logs, err := sdk.ParseABCILogs(txResult.Log)
		if err != nil {
			// transaction error logs are not in json format and will fail to parse
			// return error event with the log message
			events["0"] = cosmossdk.AttributesByEvent{"error": cosmossdk.ValueByAttribute{"message": txResult.Log}}
			return events
		}

		for _, l := range logs {
			msgIndex := strconv.Itoa(int(l.GetMsgIndex()))
			events[msgIndex] = make(cosmossdk.AttributesByEvent)

			for _, e := range l.GetEvents() {
				attributes := make(cosmossdk.ValueByAttribute)
				for _, a := range e.Attributes {
					attributes[a.Key] = a.Value
				}

				events[msgIndex][e.Type] = attributes
			}
		}
	} else {
		for _, e := range txResult.Events {
			attributes := make(cosmossdk.ValueByAttribute)
			for _, a := range e.Attributes {
				attributes[a.Key] = a.Value
			}

			msgIndex := attributes["msg_index"]
			if msgIndex == "" {
				continue
			}

			if e.Type == "message" && attributes["action"] == "" {
				continue
			}

			delete(attributes, "msg_index")

			if events[msgIndex] == nil {
				events[msgIndex] = make(cosmossdk.AttributesByEvent)
			}

			events[msgIndex][e.Type] = attributes
		}
	}

	return events
}

func ParseMessages(msgs []sdk.Msg, events cosmossdk.EventsByMsgIndex) []cosmossdk.Message {
	messages := []cosmossdk.Message{}

	if _, ok := events["0"]["error"]; ok {
		return messages
	}

	for i, msg := range msgs {
		switch v := msg.(type) {
		case *banktypes.MsgSend:
			message := cosmossdk.Message{
				Addresses: []string{v.FromAddress, v.ToAddress},
				Index:     strconv.Itoa(i),
				Origin:    v.FromAddress,
				From:      v.FromAddress,
				To:        v.ToAddress,
				Type:      "send",
				Value:     CoinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgDelegate:
			message := cosmossdk.Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
				Index:     strconv.Itoa(i),
				Origin:    v.DelegatorAddress,
				From:      v.DelegatorAddress,
				To:        v.ValidatorAddress,
				Type:      "delegate",
				Value:     CoinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgUndelegate:
			message := cosmossdk.Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
				Index:     strconv.Itoa(i),
				Origin:    v.DelegatorAddress,
				From:      v.ValidatorAddress,
				To:        v.DelegatorAddress,
				Type:      "begin_unbonding",
				Value:     CoinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgBeginRedelegate:
			message := cosmossdk.Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorSrcAddress, v.ValidatorDstAddress},
				Index:     strconv.Itoa(i),
				Origin:    v.DelegatorAddress,
				From:      v.ValidatorSrcAddress,
				To:        v.ValidatorDstAddress,
				Type:      "begin_redelegate",
				Value:     CoinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *distributiontypes.MsgWithdrawDelegatorReward:
			amount := events[strconv.Itoa(i)]["withdraw_rewards"]["amount"]

			coins, err := sdk.ParseCoinsNormalized(amount)
			if err != nil && amount != "" {
				logger.Error(err)
			}

			for _, coin := range coins {
				message := cosmossdk.Message{
					Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
					Index:     strconv.Itoa(i),
					Origin:    v.DelegatorAddress,
					From:      v.ValidatorAddress,
					To:        v.DelegatorAddress,
					Type:      "withdraw_delegator_reward",
					Value:     CoinToValue(&coin),
				}
				messages = append(messages, message)
			}
		case *ibctransfertypes.MsgTransfer:
			message := cosmossdk.Message{
				Addresses: []string{v.Sender, v.Receiver},
				Index:     strconv.Itoa(i),
				Origin:    v.Sender,
				From:      v.Sender,
				To:        v.Receiver,
				Type:      "transfer",
				Value:     CoinToValue(&v.Token),
			}
			messages = append(messages, message)
		case *ibcchanneltypes.MsgRecvPacket:
			type PacketData struct {
				Amount   string `json:"amount"`
				Denom    string `json:"denom"`
				Receiver string `json:"receiver"`
				Sender   string `json:"sender"`
			}

			d := &PacketData{}

			err := json.Unmarshal(v.Packet.Data, &d)
			if err != nil {
				logger.Error(err)
			}

			amount := events[strconv.Itoa(i)]["transfer"]["amount"]

			value := func() cosmossdk.Value {
				coin, err := sdk.ParseCoinNormalized(amount)
				if err != nil {
					return cosmossdk.Value{Amount: d.Amount, Denom: d.Denom}
				}

				return CoinToValue(&coin)
			}()

			message := cosmossdk.Message{
				Addresses: []string{d.Sender, d.Receiver},
				Index:     strconv.Itoa(i),
				Origin:    d.Sender,
				From:      d.Sender,
				To:        d.Receiver,
				Type:      "recv_packet",
				Value:     value,
			}
			messages = append(messages, message)
		}
	}

	return messages
}

func Fee(tx SigningTx, txid string, denom string) cosmossdk.Value {
	fees := tx.GetFee()

	if len(fees) == 0 {
		fees = []sdk.Coin{{Denom: denom, Amount: sdkmath.NewInt(0)}}
	} else if len(fees) > 1 {
		logger.Warnf("txid: %s - multiple fees detected (defaulting to index 0): %+v", txid, fees)
	}

	return cosmossdk.Value{
		Amount: fees[0].Amount.String(),
		Denom:  fees[0].Denom,
	}
}

// DecodeTx will attempt to decode a raw transaction in the form of
// a base64 encoded string or a protobuf encoded byte slice
func DecodeTx(encoding params.EncodingConfig, rawTx interface{}) (sdk.Tx, SigningTx, error) {
	var txBytes []byte

	switch rawTx := rawTx.(type) {
	case string:
		var err error

		txBytes, err = base64.StdEncoding.DecodeString(rawTx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "error decoding transaction from base64")
		}
	case []byte:
		txBytes = rawTx
	case cometbfttypes.Tx:
		txBytes = rawTx
	default:
		return nil, nil, errors.New("rawTx must be string or []byte")
	}

	tx, err := encoding.TxConfig.TxDecoder()(txBytes)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error decoding transaction from protobuf")
	}

	if _, ok := tx.(SigningTx); ok {
		builder, err := encoding.TxConfig.WrapTxBuilder(tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "error making transaction builder")
		}

		return tx, builder.GetTx(), nil
	} else {
		return tx, &signingTx{}, nil
	}
}
