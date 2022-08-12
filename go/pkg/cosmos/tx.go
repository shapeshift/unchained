package cosmos

import (
	"encoding/base64"
	"fmt"
	"strconv"

	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/simapp/params"
	sdk "github.com/cosmos/cosmos-sdk/types"
	errortypes "github.com/cosmos/cosmos-sdk/types/errors"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	authztypes "github.com/cosmos/cosmos-sdk/x/authz"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v3/modules/apps/transfer/types"
	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetTxHistory(address string, cursor string, pageSize int) (*TxHistory, error) {
	history := &History{
		ctx:        c.ctx,
		cursor:     &Cursor{SendPage: 1, ReceivePage: 1},
		pageSize:   pageSize,
		tendermint: c.tendermint,
		encoding:   c.encoding,
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

func (c *HTTPClient) BroadcastTx(rawTx string) (string, error) {
	return Broadcast(c.cosmos, rawTx)
}

// special case for osmo
func (c *HTTPClient) BroadcastOsmoTx(rawTx string) (string, error) {
	return Broadcast(c.keplr, rawTx)
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

func Events(log string) EventsByMsgIndex {
	logs, err := sdk.ParseABCILogs(log)

	events := make(EventsByMsgIndex)

	if err != nil {
		// transaction error logs are not in json format and will fail to parse
		// return error event with the log message
		event := Event{
			Type:       "error",
			Attributes: []Attribute{{Key: "message", Value: log}},
		}
		// TODO Figure out how to better handle this error case
		events["0"] = []Event{event}
		return events
	}

	for _, l := range logs {
		for _, e := range l.GetEvents() {
			attributes := []Attribute{}
			for _, a := range e.Attributes {
				attribute := Attribute{
					Key:   a.Key,
					Value: a.Value,
				}
				attributes = append(attributes, attribute)
			}

			event := Event{
				Type:       e.Type,
				Attributes: attributes,
			}
			msgIndex := strconv.Itoa(int(l.GetMsgIndex()))
			events[msgIndex] = append(events[msgIndex], event)
		}
	}

	return events
}

func Messages(msgs []sdk.Msg) []Message {
	messages := []Message{}

	coinToValue := func(c *sdk.Coin) Value {
		return Value{
			Amount: c.Amount.String(),
			Denom:  c.Denom,
		}
	}

	for _, msg := range msgs {
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
			message := Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
				Origin:    v.DelegatorAddress,
				From:      v.ValidatorAddress,
				To:        v.DelegatorAddress,
				Type:      v.Type(),
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
		// known message types that we currently do not support, but do not want to throw errors for
		case *authztypes.MsgExec, *authztypes.MsgGrant:
			continue
		}
	}

	return messages
}

func Fee(tx signing.Tx, txid string, defaultDenom string) Value {
	fees := tx.GetFee()

	if len(fees) == 0 {
		logger.Warnf("txid: %s, no fees detected", txid)
		fees = []sdk.Coin{{Denom: "uatom", Amount: sdk.NewInt(0)}}
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
