package cosmos

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/simapp/params"
	sdk "github.com/cosmos/cosmos-sdk/types"
	errortypes "github.com/cosmos/cosmos-sdk/types/errors"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v3/modules/apps/transfer/types"
	ibcchanneltypes "github.com/cosmos/ibc-go/v3/modules/core/04-channel/types"
	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
	tmjson "github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	rpctypes "github.com/tendermint/tendermint/rpc/jsonrpc/types"
	tmtypes "github.com/tendermint/tendermint/types"
)

func (c *HTTPClient) GetTxHistory(address string, cursor string, pageSize int) (*TxHistoryResponse, error) {
	history := &History{
		cursor:   &Cursor{SendPage: 1, ReceivePage: 1},
		pageSize: pageSize,
		client:   c,
	}

	if cursor != "" {
		if err := history.cursor.decode(cursor); err != nil {
			return nil, errors.Wrapf(err, "failed to decode cursor: %s", cursor)
		}
	}

	history.send = &TxState{
		hasMore: true,
		page:    history.cursor.SendPage,
		query:   fmt.Sprintf(`"message.sender='%s'"`, address),
	}

	history.receive = &TxState{
		hasMore: true,
		page:    history.cursor.ReceivePage,
		query:   fmt.Sprintf(`"transfer.recipient='%s'"`, address),
	}

	txHistory, err := history.fetch()
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history for address: %s", address)
	}

	return txHistory, nil
}

func (c *HTTPClient) GetTx(txid string) (*coretypes.ResultTx, error) {
	res := &rpctypes.RPCResponse{}

	_, err := c.RPC.R().SetResult(&res).SetQueryParam("hash", txid).Get("/tx")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx: %s", txid)
	}

	if res.Error != nil {
		return nil, errors.Wrapf(errors.New(res.Error.Error()), "failed to get tx: %s", txid)
	}

	tx := &coretypes.ResultTx{}
	if err := tmjson.Unmarshal(res.Result, tx); err != nil {
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

	_, err := c.RPC.R().SetResult(res).SetQueryParams(queryParams).Get("/tx_search")
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
	if err := tmjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal tx search result: %v", res.Result)
	}

	return result, nil
}

func (c *HTTPClient) BroadcastTx(rawTx string) (string, error) {
	return Broadcast(c.LCD, rawTx)
}

func Broadcast(client *resty.Client, rawTx string) (string, error) {
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

	_, err = client.R().SetBody(&txtypes.BroadcastTxRequest{TxBytes: txBytes, Mode: txtypes.BroadcastMode_BROADCAST_MODE_SYNC}).SetResult(&res).Post("/cosmos/tx/v1beta1/txs")
	if err != nil {
		return "", errors.Wrap(err, "failed to broadcast transaction")
	}

	if res.TxResponse.Code != 0 {
		message := fmt.Sprintf("failed to broadcast transaction: codespace: %s, code: %d, description", res.TxResponse.Codespace, res.TxResponse.Code)
		return "", errortypes.ABCIError(res.TxResponse.Codespace, res.TxResponse.Code, message)
	}

	return res.TxResponse.TxHash, nil
}

func (c *GRPCClient) BroadcastTx(rawTx string) (string, error) {
	txBytes, err := base64.StdEncoding.DecodeString(rawTx)
	if err != nil {
		return "", errors.Wrapf(err, "failed to decode rawTx: %s", rawTx)
	}

	res, err := c.tx.BroadcastTx(c.ctx, &txtypes.BroadcastTxRequest{TxBytes: txBytes, Mode: txtypes.BroadcastMode_BROADCAST_MODE_SYNC})
	if err != nil {
		return "", errors.Wrap(err, "failed to broadcast transaction")
	}

	return res.TxResponse.TxHash, nil
}

func ParseEvents(log string) EventsByMsgIndex {
	events := make(EventsByMsgIndex)

	logs, err := sdk.ParseABCILogs(log)
	if err != nil {
		// transaction error logs are not in json format and will fail to parse
		// return error event with the log message
		// TODO: Figure out how to better handle this error case
		events["0"] = AttributesByEvent{"error": ValueByAttribute{"message": log}}
		return events
	}

	for _, l := range logs {
		msgIndex := strconv.Itoa(int(l.GetMsgIndex()))
		events[msgIndex] = make(AttributesByEvent)

		for _, e := range l.GetEvents() {
			attributes := make(ValueByAttribute)
			for _, a := range e.Attributes {
				attributes[a.Key] = a.Value
			}

			events[msgIndex][e.Type] = attributes
		}
	}

	return events
}

func ParseMessages(msgs []sdk.Msg, events EventsByMsgIndex) []Message {
	messages := []Message{}

	coinToValue := func(c *sdk.Coin) Value {
		return Value{
			Amount: c.Amount.String(),
			Denom:  c.Denom,
		}
	}

	for i, msg := range msgs {
		switch v := msg.(type) {
		case *banktypes.MsgSend:
			message := Message{
				Addresses: []string{v.FromAddress, v.ToAddress},
				Origin:    v.FromAddress,
				From:      v.FromAddress,
				To:        v.ToAddress,
				Type:      v.Type(),
				Value:     coinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgDelegate:
			message := Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
				Origin:    v.DelegatorAddress,
				From:      v.DelegatorAddress,
				To:        v.ValidatorAddress,
				Type:      v.Type(),
				Value:     coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgUndelegate:
			message := Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
				Origin:    v.DelegatorAddress,
				From:      v.ValidatorAddress,
				To:        v.DelegatorAddress,
				Type:      v.Type(),
				Value:     coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgBeginRedelegate:
			message := Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorSrcAddress, v.ValidatorDstAddress},
				Origin:    v.DelegatorAddress,
				From:      v.ValidatorSrcAddress,
				To:        v.ValidatorDstAddress,
				Type:      v.Type(),
				Value:     coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *distributiontypes.MsgWithdrawDelegatorReward:
			amount := events[strconv.Itoa(i)]["withdraw_rewards"]["amount"]

			coin, err := sdk.ParseCoinNormalized(amount)
			if err != nil && amount != "" {
				logger.Error(err)
			}

			message := Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
				Origin:    v.DelegatorAddress,
				From:      v.ValidatorAddress,
				To:        v.DelegatorAddress,
				Type:      v.Type(),
				Value:     coinToValue(&coin),
			}
			messages = append(messages, message)
		case *ibctransfertypes.MsgTransfer:
			message := Message{
				Addresses: []string{v.Sender, v.Receiver},
				Origin:    v.Sender,
				From:      v.Sender,
				To:        v.Receiver,
				Type:      v.Type(),
				Value:     coinToValue(&v.Token),
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

			coin, err := sdk.ParseCoinNormalized(amount)
			if err != nil {
				logger.Error(err)
			}

			message := Message{
				Addresses: []string{d.Sender, d.Receiver},
				Origin:    d.Sender,
				From:      d.Sender,
				To:        d.Receiver,
				Type:      "recv_packet",
				Value:     coinToValue(&coin),
			}
			messages = append(messages, message)
		}
	}

	return messages
}

func Fee(tx signing.Tx, txid string, denom string) Value {
	fees := tx.GetFee()

	if len(fees) == 0 {
		fees = []sdk.Coin{{Denom: denom, Amount: sdk.NewInt(0)}}
	} else if len(fees) > 1 {
		logger.Warnf("txid: %s - multiple fees detected (defaulting to index 0): %+v", txid, fees)
	}

	return Value{
		Amount: fees[0].Amount.String(),
		Denom:  fees[0].Denom,
	}
}

// DecodeTx will attempt to decode a raw transaction in the form of
// a base64 encoded string or a protobuf encoded byte slice
func DecodeTx(encoding params.EncodingConfig, rawTx interface{}) (sdk.Tx, signing.Tx, error) {
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
	case tmtypes.Tx:
		txBytes = rawTx
	default:
		return nil, nil, errors.New("rawTx must be string or []byte")
	}

	tx, err := encoding.TxConfig.TxDecoder()(txBytes)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error decoding transaction from protobuf")
	}

	builder, err := encoding.TxConfig.WrapTxBuilder(tx)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error making transaction builder")
	}

	return tx, builder.GetTx(), nil
}

func GetTxAddrs(events EventsByMsgIndex, messages []Message) []string {
	seen := make(map[string]bool)
	addrs := []string{}

	// check events for addresses
	for _, e := range events {
		for _, attributes := range e {
			for key, val := range attributes {
				switch key {
				case "spender", "sender", "receiver", "recipient", "validator":
					if _, ok := seen[val]; !ok {
						addrs = append(addrs, val)
						seen[val] = true
					}
				}

			}
		}
	}

	// check messages for addresses
	for _, m := range messages {
		if m.Addresses == nil {
			continue
		}

		// unique set of addresses
		for _, addr := range m.Addresses {
			if _, ok := seen[addr]; !ok {
				addrs = append(addrs, addr)
				seen[addr] = true
			}
		}
	}

	return addrs
}
