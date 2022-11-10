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
	abci "github.com/tendermint/tendermint/abci/types"
	"github.com/tendermint/tendermint/types"
)

type Handler struct {
	*cosmos.Handler
}

func (h *Handler) StartWebsocket() error {
	h.WSClient.EndBlockEventHandler(func(eventCache map[string]interface{}, blockHeader types.Header, endBlockEvents []abci.Event, eventIndex int) (interface{}, []string, error) {
		tx, err := h.getTxFromEndBlockEvents(eventCache, blockHeader, endBlockEvents, eventIndex)
		if err != nil {
			return nil, nil, errors.Wrap(err, "failed to get txs from end block events")
		}

		if tx == nil {
			return nil, nil, nil
		}

		t, err := tx.formatTx(tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to format transaction: %s", tx.TxID)
		}

		addrs := cosmos.GetTxAddrs(tx.Events, tx.Messages)

		return t, addrs, nil
	})

	return h.Handler.StartWebsocket()
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
	request := func(query string, page int, pageSize int) ([]cosmos.HistoryTx, error) {
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

			eventCache := make(map[string]interface{})

			for i := range blockResult.EndBlockEvents {
				tx, err := h.getTxFromEndBlockEvents(eventCache, b.Block.Header, blockResult.EndBlockEvents, i)
				if err != nil {
					return nil, errors.Wrap(err, "failed to get tx from end block events")
				}

				if tx == nil {
					continue
				}

				// track all addresses associated with the transaction
				addrs := make(map[string]struct{})
				for _, addr := range cosmos.GetTxAddrs(tx.Events, tx.Messages) {
					addrs[addr] = struct{}{}
				}

				// skip any transactions that pubkey is not associated with
				if _, ok := addrs[pubkey]; !ok {
					continue
				}

				txs = append(txs, tx)
			}
		}

		return txs, nil
	}

	sources := cosmos.TxHistorySources(h.HTTPClient, pubkey, h.Handler.FormatTx)
	sources["swap"] = cosmos.NewTxState(true, fmt.Sprintf(`"outbound.to='%s'"`, pubkey), request)

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

func (h *Handler) getTxFromEndBlockEvents(eventCache map[string]interface{}, blockHeader types.Header, endBlockEvents []abci.Event, eventIndex int) (*ResultTx, error) {
	// attempt to find matching fee event for txid or use default fee as defined by https://daemon.thorchain.shapeshift.com/lcd/thorchain/constants
	matchFee := func(txid string, events []thorchain.TypedEvent) cosmos.Value {
		for _, e := range events {
			switch v := e.(type) {
			case *thorchain.EventFee:
				if txid == v.TxID {
					return thorchain.CoinToValue(v.Coins)
				}
			}
		}

		return cosmos.Value{Amount: "2000000", Denom: h.Denom}
	}

	// cache parsed block events for use in all subsequent event indices within the block
	if eventCache["events"] == nil || eventCache["typedEvents"] == nil {
		events, typedEvents, err := thorchain.ParseBlockEvents(endBlockEvents)
		if err != nil {
			return nil, errors.Wrap(err, "failed to parse block events")
		}

		eventCache["events"] = events
		eventCache["typedEvents"] = typedEvents
	}

	events := eventCache["events"].(cosmos.EventsByMsgIndex)
	typedEvents := eventCache["typedEvents"].([]thorchain.TypedEvent)
	typedEvent := typedEvents[eventIndex]

	tx := &ResultTx{
		Hash:       blockHeader.Hash().String(),
		Height:     blockHeader.Height,
		Timestamp:  int(blockHeader.Time.Unix()),
		Events:     cosmos.EventsByMsgIndex{"0": events[strconv.Itoa(eventIndex)]},
		Messages:   thorchain.TypedEventsToMessages([]thorchain.TypedEvent{typedEvent}),
		TypedEvent: typedEvent,
		formatTx:   h.formatTx,
	}

	switch v := typedEvent.(type) {
	case *thorchain.EventOutbound:
		tx.TxID = v.InTxID
		tx.Fee = matchFee(v.InTxID, typedEvents)
	default:
		return nil, nil
	}

	return tx, nil
}

// formatTx creates a synthetic transaction from a BlockEndEvent
func (h *Handler) formatTx(tx *ResultTx) (*cosmos.Tx, error) {
	t := &cosmos.Tx{
		BaseTx: api.BaseTx{
			BlockHash:   &tx.Hash,
			BlockHeight: int(tx.Height),
			Timestamp:   tx.Timestamp,
		},
		Index:         -1, // synthetic transactions don't have a real tx index
		Fee:           tx.Fee,
		Confirmations: h.BlockService.Latest.Height - int(tx.Height) + 1,
		Events:        tx.Events,
		GasWanted:     "0",
		GasUsed:       "0",
		Messages:      tx.Messages,
	}

	switch v := tx.TypedEvent.(type) {
	case *thorchain.EventOutbound:
		t.BaseTx.TxID = v.InTxID
		t.Memo = v.Memo
	}

	return t, nil
}
