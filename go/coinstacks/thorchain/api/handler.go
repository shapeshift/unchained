package api

import (
	"fmt"
	"math/big"
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/coinstacks/thorchain"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
)

type Handler struct {
	*cosmos.Handler
}

// Contains info about the running coinstack
// swagger:model Info
type Info struct {
	// swagger:allOf
	cosmos.Info
}

func (h *Handler) GetInfo() (api.Info, error) {
	info, err := h.Handler.GetInfo()
	if err != nil {
		return nil, err
	}

	i := Info{Info: info.(cosmos.Info)}

	return i, nil
}

// Contains info about account details for an address or xpub
// swagger:model Account
type Account struct {
	// swagger:allOf
	cosmos.Account
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	account, err := h.Handler.GetAccount(pubkey)
	if err != nil {
		return nil, err
	}

	a := Account{Account: account.(cosmos.Account)}

	return a, nil
}

func (h *Handler) GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	address := "thor1ycgzfpcz93qa0xc392xgk75lfee5vdc59hv3r8"
	query := fmt.Sprintf(`"outbound.to='%s'"`, address)
	page := 1
	pageSize = 10

	// search for any blocks address was associated with an outbound swap event
	result, err := h.HTTPClient.BlockSearch(query, page, pageSize)
	if err != nil {
		return nil, errors.WithStack(err)
	}

	txs := []cosmos.Tx{}
	for _, b := range result.Blocks {
		// fetch block results for each block found so we can inspect the EndBlockEvents
		blockResult, err := h.HTTPClient.BlockResults(int(b.Block.Height))
		if err != nil {
			return nil, errors.WithStack(err)
		}

		// synthesize transactions from the EndBlockEvents
		t, err := h.formatTxsFromBlockResult(blockResult, address)
		if err != nil {
			return nil, errors.WithStack(err)
		}

		txs = append(txs, t...)
	}

	history := cosmos.TxHistory{
		BaseTxHistory: api.BaseTxHistory{
			Pagination: api.Pagination{
				Cursor: "",
			},
		},
		Txs: txs,
	}

	return history, nil
}

func (h *Handler) ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	return thorchain.ParseMessages(msgs, events)
}

func (h *Handler) ParseFee(tx signing.Tx, txid string, denom string) cosmos.Value {
	fee := cosmos.Fee(tx, txid, denom)

	i := new(big.Int)
	i.SetString(fee.Amount, 10)

	// add outbound fee automatically deducted from every transaction but not tracked as an actual tx fee
	// TODO: query and cache value returned from the node at https://daemon.thorchain.shapeshift.com/lcd/thorchain/constants
	fee.Amount = i.Add(i, big.NewInt(2000000)).String()

	return fee
}

func (h *Handler) formatTxsFromBlockResult(blockResult *coretypes.ResultBlockResults, address string) ([]cosmos.Tx, error) {
	height := int(blockResult.Height)

	block, err := h.BlockService.GetBlock(height)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %d", height)
	}

	events, typedEvents, err := thorchain.ParseBlockEvents(blockResult.EndBlockEvents)
	if err != nil {
		return nil, errors.Wrap(err, "failed to parse block events")
	}

	txs := []cosmos.Tx{}
	for i, event := range typedEvents {
		tx := cosmos.Tx{
			BaseTx: api.BaseTx{
				BlockHash:   &block.Hash,
				BlockHeight: block.Height,
				Timestamp:   block.Timestamp,
			},
			Fee:           cosmos.Value{Amount: "0", Denom: "rune"},
			Confirmations: h.BlockService.Latest.Height - int(height) + 1,
			Events:        cosmos.EventsByMsgIndex{"0": events[strconv.Itoa(i)]},
			GasWanted:     "0",
			GasUsed:       "0",
			Messages:      thorchain.TypedEventsToMessages([]thorchain.TypedEvent{event}),
		}

		addrs := make(map[string]struct{})
		for _, addr := range cosmos.GetTxAddrs(tx.Events, tx.Messages) {
			addrs[addr] = struct{}{}
		}

		// do not create synthetic transaction for block events that aren't associated with the search address
		if _, ok := addrs[address]; !ok {
			continue
		}

		switch v := event.(type) {
		case *thorchain.EventOutbound:
			tx.BaseTx.TxID = v.InTxID
			tx.Memo = v.Memo
		default:
			continue
		}

		txs = append(txs, tx)
	}

	return txs, nil
}
