package cosmos

import (
	"encoding/base64"

	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/simapp/params"
	sdk "github.com/cosmos/cosmos-sdk/types"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	disttypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v3/modules/apps/transfer/types"
	ibcclienttypes "github.com/cosmos/ibc-go/v3/modules/core/02-client/types"
	ibcchanneltypes "github.com/cosmos/ibc-go/v3/modules/core/04-channel/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/pkg/tendermint/client"
	liquiditytypes "github.com/tendermint/liquidity/x/liquidity/types"
)

func (c *HTTPClient) GetTxHistory(address string, cursor string, pageSize int) (*TxHistory, error) {
	history := History{
		ctx:               c.ctx,
		address:           address,
		cursor:            Cursor{LastBlockHeight: -1},
		sendTxs:           []client.TxSearchResponseResultTxs{},
		hasMoreSendTxs:    true,
		receiveTxs:        []client.TxSearchResponseResultTxs{},
		hasMoreReceiveTxs: true,
		pageSize:          pageSize,
		tendermintClient:  c.tendermintClient,
		encoding:          c.encoding,
	}

	if cursor != "" {
		if err := history.cursor.decode(cursor); err != nil {
			return nil, errors.Wrapf(err, "failed to decode cursor: %s", cursor)
		}
	}

	txHistory, err := history.fetch()
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history for address: %s", address)
	}

	return txHistory, nil
}

func (c *HTTPClient) BroadcastTx(txBytes []byte) (string, error) {
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

	_, err := c.cosmos.R().SetBody(&txtypes.BroadcastTxRequest{TxBytes: txBytes, Mode: txtypes.BroadcastMode_BROADCAST_MODE_SYNC}).SetResult(&res).Post("/cosmos/tx/v1beta1/txs")
	if err != nil {
		return "", errors.Wrap(err, "failed to broadcast transaction")
	}

	if res.TxResponse.Code != 0 {
		return "", errors.New(res.TxResponse.RawLog)
	}

	return res.TxResponse.TxHash, nil
}

func (c *GRPCClient) BroadcastTx(txBytes []byte) (string, error) {
	res, err := c.tx.BroadcastTx(c.ctx, &txtypes.BroadcastTxRequest{TxBytes: txBytes, Mode: txtypes.BroadcastMode_BROADCAST_MODE_SYNC})
	if err != nil {
		return "", errors.Wrap(err, "failed to broadcast transaction")
	}

	return res.TxResponse.TxHash, nil
}

func Events(log string) []Event {
	logs, err := sdk.ParseABCILogs(log)
	if err != nil {
		// transaction error logs are not in json format and will fail to parse
		// return error event with the log message
		event := Event{
			Type:       "error",
			Attributes: []Attribute{{Key: "message", Value: log}},
		}

		return []Event{event}
	}

	events := []Event{}
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
			events = append(events, event)
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
				From:      v.FromAddress,
				To:        v.ToAddress,
				Type:      v.Type(),
				Value:     coinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgDelegate:
			message := Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
				From:      v.DelegatorAddress,
				To:        v.ValidatorAddress,
				Type:      v.Type(),
				Value:     coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgUndelegate:
			message := Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
				From:      v.ValidatorAddress,
				To:        v.DelegatorAddress,
				Type:      v.Type(),
				Value:     coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgBeginRedelegate:
			message := Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorSrcAddress, v.ValidatorDstAddress},
				From:      v.ValidatorSrcAddress,
				To:        v.ValidatorDstAddress,
				Type:      v.Type(),
				Value:     coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *disttypes.MsgWithdrawDelegatorReward:
			message := Message{
				Addresses: []string{v.DelegatorAddress, v.ValidatorAddress},
				From:      v.ValidatorAddress,
				To:        v.DelegatorAddress,
				Type:      v.Type(),
			}
			messages = append(messages, message)
		case *ibctransfertypes.MsgTransfer:
			message := Message{
				Addresses: []string{v.Sender, v.Receiver},
				From:      v.Sender,
				To:        v.Receiver,
				Type:      v.Type(),
				Value:     coinToValue(&v.Token),
			}
			messages = append(messages, message)
		case *liquiditytypes.MsgSwapWithinBatch,
			*ibcclienttypes.MsgUpdateClient,
			*ibcchanneltypes.MsgAcknowledgement,
			*ibcchanneltypes.MsgRecvPacket:
			// known but not currently handled
		default:
			logger.Warnf("unsupported message type: %T", v)
		}
	}

	return messages
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
