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
	blockSearch := func(query string, page int, pageSize int) ([]cosmos.HistoryTx, error) {
		// search for any blocks where pubkey was associated with an indexed block event
		result, err := h.HTTPClient.BlockSearch(query, page, pageSize)
		if err != nil {
			return nil, errors.WithStack(err)
		}

		txs := []cosmos.HistoryTx{}
		for _, b := range result.Blocks {
			// fetch block results for each block found so we can inspect the EndBlockEvents
			blockResult, err := h.HTTPClient.BlockResults(int(b.Block.Height))
			if err != nil {
				return nil, errors.WithStack(err)
			}

			// parse block events so we can filter by address and attach the appropriate event to the ResultTx
			events, typedEvents, err := thorchain.ParseBlockEvents(blockResult.EndBlockEvents)
			if err != nil {
				return nil, errors.Wrap(err, "failed to parse block events")
			}

			for i, event := range typedEvents {
				// track all addresses associated with the event
				addrs := make(map[string]struct{})
				for _, addr := range cosmos.GetTxAddrs(events, thorchain.TypedEventsToMessages([]thorchain.TypedEvent{event})) {
					addrs[addr] = struct{}{}
				}

				// skip any events that pubkey is not associated with
				if _, ok := addrs[pubkey]; !ok {
					continue
				}

				tx := &ResultTx{
					Height:     b.Block.Height,
					Event:      events[strconv.Itoa(i)],
					TypedEvent: event,
					formatTx:   h.formatTx,
				}

				switch v := event.(type) {
				case *thorchain.EventOutbound:
					tx.TxID = v.InTxID
				default:
					continue
				}

				txs = append(txs, tx)
			}
		}

		return txs, nil
	}

	sources := cosmos.NewDefaultSources(h.HTTPClient, pubkey, h.Handler.FormatTx)
	sources["swap"] = cosmos.NewTxState(true, fmt.Sprintf(`"outbound.to='%s'"`, pubkey), blockSearch)

	res, err := h.HTTPClient.GetTxHistory(pubkey, cursor, pageSize, sources)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history")
	}

	txHistory := cosmos.TxHistory{
		BaseTxHistory: api.BaseTxHistory{
			Pagination: api.Pagination{
				Cursor: res.Cursor,
			},
			Pubkey: pubkey,
		},
		Txs: res.Txs,
	}

	return txHistory, nil
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

// formatTx creates a synthetic transaction from a BlockEndEvent
func (h *Handler) formatTx(tx *ResultTx) (*cosmos.Tx, error) {
	block, err := h.BlockService.GetBlock(int(tx.Height))
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %d", tx.Height)
	}

	t := &cosmos.Tx{
		BaseTx: api.BaseTx{
			BlockHash:   &block.Hash,
			BlockHeight: block.Height,
			Timestamp:   block.Timestamp,
		},
		Index:         -1, // synthetic transactions don't have a real tx index
		Fee:           cosmos.Value{Amount: "2000000", Denom: "rune"},
		Confirmations: h.BlockService.Latest.Height - int(block.Height) + 1,
		Events:        cosmos.EventsByMsgIndex{"0": tx.Event},
		GasWanted:     "0",
		GasUsed:       "0",
		Messages:      thorchain.TypedEventsToMessages([]thorchain.TypedEvent{tx.TypedEvent}),
	}

	switch v := tx.TypedEvent.(type) {
	case *thorchain.EventOutbound:
		t.BaseTx.TxID = v.InTxID
		t.Memo = v.Memo
	}

	return t, nil
}
