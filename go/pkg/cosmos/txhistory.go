package cosmos

import (
	"encoding/base64"
	"fmt"
	"sort"

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

type Tx struct {
	TendermintTx client.TxSearchResponseResultTxs
	CosmosTx     sdk.Tx
	SigningTx    signing.Tx
}

type TxHistoryResponse struct {
	Txs []Tx
}

type Message struct {
	From  string    `json:"from,omitempty"`
	To    string    `json:"to,omitempty"`
	Type  string    `json:"type"`
	Value *sdk.Coin `json:"value,omitempty"`
}

type Event = sdk.StringEvent

func Events(log string) []Event {
	logs, err := sdk.ParseABCILogs(log)
	if err != nil {
		logger.Error("failed to parse logs: %s", err)
		return nil
	}

	events := []Event{}
	for _, l := range logs {
		for _, e := range l.GetEvents() {
			events = append(events, e)
		}
	}

	return events
}

func Messages(msgs []sdk.Msg) []Message {
	messages := []Message{}

	for _, msg := range msgs {
		switch v := msg.(type) {
		case *banktypes.MsgSend:
			message := Message{
				From:  v.FromAddress,
				To:    v.ToAddress,
				Type:  v.Type(),
				Value: &v.Amount[0],
			}
			messages = append(messages, message)
			break
		case *stakingtypes.MsgDelegate:
			message := Message{
				From:  v.DelegatorAddress,
				Type:  v.Type(),
				Value: &v.Amount,
			}
			messages = append(messages, message)
			break
		case *stakingtypes.MsgUndelegate:
			message := Message{
				From:  v.DelegatorAddress,
				To:    v.ValidatorAddress,
				Type:  v.Type(),
				Value: &v.Amount,
			}
			messages = append(messages, message)
			break
		case *stakingtypes.MsgBeginRedelegate:
			message := Message{
				From:  v.DelegatorAddress,
				Type:  v.Type(),
				Value: &v.Amount,
			}
			messages = append(messages, message)
			break
		case *disttypes.MsgWithdrawDelegatorReward:
			message := Message{
				From: v.ValidatorAddress,
				To:   v.DelegatorAddress,
				Type: v.Type(),
			}
			messages = append(messages, message)
			break
		case *ibctypes.MsgTransfer:
			message := Message{
				From:  v.Sender,
				To:    v.Receiver,
				Type:  v.Type(),
				Value: &v.Token,
			}
			messages = append(messages, message)
			break
		case *ibccoretypes.MsgUpdateClient:
			message := Message{
				From: v.Signer,
				Type: v.Type(),
			}
			messages = append(messages, message)
			break
		case *ibcchanneltypes.MsgRecvPacket:
			message := Message{
				From: v.Signer,
				Type: v.Type(),
			}
			messages = append(messages, message)
			break
		default:
			logger.Warnf("unsupported message type: %s, %T", v.Type(), v)
		}
	}

	return messages
}

func (c *HTTPClient) GetTxHistory(address string) (*TxHistoryResponse, error) {
	if !isValidAddress(address) {
		return nil, errors.New(fmt.Sprintf("invalid address: %s", address))
	}

	res, _, err := c.tendermintClient.InfoApi.TxSearch(c.ctx).Query(fmt.Sprintf("\"message.sender='%s'\"", address)).Execute()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get send transactions")
	}

	resTxs := res.Result.Txs

	res, _, err = c.tendermintClient.InfoApi.TxSearch(c.ctx).Query(fmt.Sprintf("\"transfer.recipient='%s'\"", address)).Execute()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get send transactions")
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

	txHistory := &TxHistoryResponse{
		Txs: txs,
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
