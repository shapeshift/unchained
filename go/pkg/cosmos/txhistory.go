package cosmos

import (
	"encoding/base64"
	"fmt"
	"math"
	"sort"
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	disttypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	ibctypes "github.com/cosmos/cosmos-sdk/x/ibc/applications/transfer/types"
	ibccoretypes "github.com/cosmos/cosmos-sdk/x/ibc/core/02-client/types"
	ibcchanneltypes "github.com/cosmos/cosmos-sdk/x/ibc/core/04-channel/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/pkg/tendermint/client"
)

func Events(log string) []Event {
	logs, err := sdk.ParseABCILogs(log)
	if err != nil {
		logger.Error("failed to parse logs: %s", err)
		return nil
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
				From:  v.FromAddress,
				To:    v.ToAddress,
				Type:  v.Type(),
				Value: coinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgDelegate:
			message := Message{
				From:  v.DelegatorAddress,
				Type:  v.Type(),
				Value: coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgUndelegate:
			message := Message{
				From:  v.DelegatorAddress,
				To:    v.ValidatorAddress,
				Type:  v.Type(),
				Value: coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgBeginRedelegate:
			message := Message{
				From:  v.DelegatorAddress,
				Type:  v.Type(),
				Value: coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *disttypes.MsgWithdrawDelegatorReward:
			message := Message{
				From: v.ValidatorAddress,
				To:   v.DelegatorAddress,
				Type: v.Type(),
			}
			messages = append(messages, message)
		case *ibctypes.MsgTransfer:
			message := Message{
				From:  v.Sender,
				To:    v.Receiver,
				Type:  v.Type(),
				Value: coinToValue(&v.Token),
			}
			messages = append(messages, message)
		case *ibccoretypes.MsgUpdateClient:
			message := Message{
				From: v.Signer,
				Type: v.Type(),
			}
			messages = append(messages, message)
		case *ibcchanneltypes.MsgRecvPacket:
			message := Message{
				From: v.Signer,
				Type: v.Type(),
			}
			messages = append(messages, message)
		default:
			logger.Warnf("unsupported message type: %s, %T", v.Type(), v)
		}
	}

	return messages
}

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
		cosmosTx, signingTx, err := c.decodeTx(*t.Tx)
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

func (c *HTTPClient) decodeTx(rawTx string) (sdk.Tx, signing.Tx, error) {
	protoTx, err := base64.StdEncoding.DecodeString(rawTx)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error decoding transaction from base64")
	}

	sdkTx, err := c.encoding.TxConfig.TxDecoder()(protoTx)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error decoding transaction from protobuf")
	}

	builder, err := c.encoding.TxConfig.WrapTxBuilder(sdkTx)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error making transaction builder")
	}

	return sdkTx, builder.GetTx(), nil
}
