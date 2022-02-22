package cosmos

import (
	"encoding/base64"
	"fmt"
	"math"
	"sort"
	"strconv"

	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/simapp/params"
	sdk "github.com/cosmos/cosmos-sdk/types"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v3/modules/apps/transfer/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/tendermint/client"
)

func (c *HTTPClient) GetTxHistory(address string, page int, pageSize int) (*TxHistory, error) {
	res, _, err := c.tendermintClient.InfoApi.TxSearch(c.ctx).Query(fmt.Sprintf("\"message.sender='%s'\"", address)).Page(int32(page)).PerPage(int32(pageSize)).OrderBy("\"desc\"").Execute()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get send transactions")
	}

	totalSend, err := strconv.ParseFloat(res.Result.TotalCount, 64)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse totalSend: %s", res.Result.TotalCount)
	}

	resTxs := res.Result.Txs

	res, _, err = c.tendermintClient.InfoApi.TxSearch(c.ctx).Query(fmt.Sprintf("\"transfer.recipient='%s'\"", address)).Page(int32(page)).PerPage(int32(pageSize)).OrderBy("\"desc\"").Execute()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get receive transactions")
	}

	totalReceive, err := strconv.ParseFloat(res.Result.TotalCount, 64)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse totalReceive: %s", res.Result.TotalCount)
	}

	resTxs = append(resTxs, res.Result.Txs...)

	// filter out duplicate transactions
	seen := make(map[string]bool)
	uniqueTxs := []client.TxSearchResponseResultTxs{}
	for _, t := range resTxs {
		if _, ok := seen[*t.Hash]; !ok {
			uniqueTxs = append(uniqueTxs, t)
			seen[*t.Hash] = true
		}
	}

	// sort descending by block height
	sort.Slice(uniqueTxs, func(i, j int) bool {
		if *uniqueTxs[i].Height == *uniqueTxs[j].Height {
			return *uniqueTxs[i].Index > *uniqueTxs[j].Index
		}
		return *uniqueTxs[i].Height > *uniqueTxs[j].Height
	})

	txs := []Tx{}
	for _, t := range uniqueTxs {
		cosmosTx, signingTx, err := DecodeTx(*c.encoding, *t.Tx)
		if err != nil {
			logger.Errorf("failed to decode tx: %s: %s", *t.Hash, err.Error())
			continue
		}

		tx := Tx{
			TendermintTx: t,
			CosmosTx:     cosmosTx,
			SigningTx:    signingTx,
		}
		txs = append(txs, tx)
	}

	var totalPages int
	if totalSend >= totalReceive {
		totalPages = int(math.Ceil(totalSend / float64(pageSize)))
	} else {
		totalPages = int(math.Ceil(totalReceive / float64(pageSize)))
	}

	txHistory := &TxHistory{
		TotalPages: totalPages,
		Txs:        txs,
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
		case *distributiontypes.MsgWithdrawDelegatorReward:
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
