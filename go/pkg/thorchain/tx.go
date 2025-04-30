package thorchain

import (
	"fmt"
	"strconv"

	sdkmath "cosmossdk.io/math"
	"github.com/cometbft/cometbft/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"gitlab.com/thorchain/thornode/v3/common"
	thorchaintypes "gitlab.com/thorchain/thornode/v3/x/thorchain/types"
)

func GetTxHistory(handler *cosmos.Handler, pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	request := func(query string, page int, pageSize int) ([]cosmos.HistoryTx, error) {
		// search for any blocks where pubkey was associated with an indexed block event
		result, err := handler.HTTPClient.BlockSearch(query, page, pageSize)
		if err != nil {
			return nil, errors.WithStack(err)
		}

		txs := []cosmos.HistoryTx{}
		for _, b := range result.Blocks {
			// fetch block results for each block found so we can inspect the block events
			blockResult, err := handler.HTTPClient.BlockResults(int(b.Block.Height))
			if err != nil {
				return nil, errors.WithStack(err)
			}

			eventCache := make(map[string]interface{})

			for i := range blockResult.GetBlockEvents() {
				tx, err := GetTxFromBlockEvents(eventCache, b.Block.Header, blockResult.GetBlockEvents(), i, handler.BlockService.Latest.Height, handler.Denom, handler.NativeFee)
				if err != nil {
					return nil, errors.Wrap(err, "failed to get tx from block events")
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

	sources := cosmos.TxHistorySources(handler.HTTPClient, pubkey, handler.FormatTx)
	sources["swap"] = cosmos.NewTxState(true, fmt.Sprintf(`"outbound.to='%s'"`, pubkey), request)

	res, err := handler.HTTPClient.GetTxHistory(pubkey, cursor, pageSize, sources)
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

// ParseMessages will parse any thorchain or cosmos-sdk message types
func ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	messages := []cosmos.Message{}

	if _, ok := events["0"]["error"]; ok {
		return messages
	}

	unhandledMsgs := []sdk.Msg{}
	for i, msg := range msgs {
		switch v := msg.(type) {
		case *thorchaintypes.MsgSend:
			message := cosmos.Message{
				Addresses: []string{v.FromAddress.String(), v.ToAddress.String()},
				Index:     strconv.Itoa(i),
				Origin:    v.FromAddress.String(),
				From:      v.FromAddress.String(),
				To:        v.ToAddress.String(),
				Type:      "send",
				Value:     cosmos.CoinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		case *thorchaintypes.MsgDeposit:
			coin := v.Coins[0]

			to := events[strconv.Itoa(i)]["transfer"]["recipient"]
			events[strconv.Itoa(i)]["message"]["memo"] = v.Memo // add memo value from message to events

			// detect withdraw event as a result of the deposit and use this to address instead
			withdraw := events[strconv.Itoa(i)]["withdraw"]
			if withdraw != nil {
				to = withdraw["to"]
			}

			// detect refund event as a result of the deposit and use this to address instead
			refund := events[strconv.Itoa(i)]["refund"]
			if refund != nil {
				to = refund["to"]
			}

			message := cosmos.Message{
				Addresses: []string{v.Signer.String(), to},
				Index:     strconv.Itoa(i),
				Origin:    v.Signer.String(),
				From:      v.Signer.String(),
				To:        to,
				Type:      "deposit",
				Value: cosmos.CoinToValue(&sdk.Coin{
					Denom:  coin.Asset.Native(),
					Amount: sdkmath.NewIntFromBigInt(coin.Amount.BigInt()),
				}),
			}
			messages = append(messages, message)

			// detect outbound event as a result of the deposit and create a synthetic message for it
			outbound := events[strconv.Itoa(i)]["outbound"]
			if outbound != nil {
				coin, err := common.ParseCoin(outbound["coin"])
				if err != nil && outbound["coin"] != "" {
					logger.Error(err)
				}

				message := cosmos.Message{
					Addresses: []string{outbound["from"], outbound["to"]},
					Index:     strconv.Itoa(i),
					Origin:    outbound["from"],
					From:      outbound["from"],
					To:        outbound["to"],
					Type:      "outbound",
					Value: cosmos.CoinToValue(&sdk.Coin{
						Denom:  coin.Asset.Native(),
						Amount: sdkmath.NewIntFromBigInt(coin.Amount.BigInt()),
					}),
				}
				messages = append(messages, message)
			}

		default:
			unhandledMsgs = append(unhandledMsgs, msg)
		}
	}

	messages = append(messages, cosmos.ParseMessages(unhandledMsgs, events)...)

	return messages
}

func GetTxFromBlockEvents(eventCache map[string]interface{}, blockHeader types.Header, blockEvents []cosmos.ABCIEvent, eventIndex int, latestHeight int, denom string, nativeFee int) (*ResultTx, error) {
	// attempt to find matching fee event for txid or use native fee
	matchFee := func(txid string, events []TypedEvent) cosmos.Value {
		for _, e := range events {
			switch v := e.(type) {
			case *EventFee:
				if txid == v.TxID {
					coin, err := common.ParseCoin(v.Coins)
					if err != nil && v.Coins != "" {
						logger.Error(err)
					}

					return cosmos.CoinToValue(&sdk.Coin{
						Denom:  coin.Asset.Native(),
						Amount: sdkmath.NewIntFromBigInt(coin.Amount.BigInt()),
					})
				}
			}
		}

		return cosmos.Value{Amount: strconv.Itoa(nativeFee), Denom: denom}
	}

	// cache parsed block events for use in all subsequent event indices within the block
	if eventCache["events"] == nil || eventCache["typedEvents"] == nil {
		events, typedEvents, err := ParseBlockEvents(blockEvents)
		if err != nil {
			return nil, errors.Wrap(err, "failed to parse block events")
		}

		eventCache["events"] = events
		eventCache["typedEvents"] = typedEvents
	}

	events := eventCache["events"].(cosmos.EventsByMsgIndex)
	typedEvents := eventCache["typedEvents"].([]TypedEvent)
	typedEvent := typedEvents[eventIndex]

	tx := &ResultTx{
		BlockHash:    blockHeader.Hash().String(),
		BlockHeight:  blockHeader.Height,
		Timestamp:    int(blockHeader.Time.Unix()),
		Index:        -1, // synthetic transactions don't have a real tx index
		Events:       cosmos.EventsByMsgIndex{"0": events[strconv.Itoa(eventIndex)]},
		Messages:     typedEventsToMessages([]TypedEvent{typedEvent}),
		TypedEvent:   typedEvent,
		latestHeight: latestHeight,
		formatTx:     formatTx,
	}

	switch v := typedEvent.(type) {
	case *EventOutbound:
		tx.TxID = v.InTxID
		tx.Memo = v.Memo
		tx.Fee = matchFee(v.InTxID, typedEvents)
		return tx, nil
	default:
		return nil, nil
	}
}

// formatTx creates a synthetic transaction from a BlockEndEvent
func formatTx(tx *ResultTx) (*cosmos.Tx, error) {
	t := &cosmos.Tx{
		BaseTx: api.BaseTx{
			TxID:        tx.TxID,
			BlockHash:   &tx.BlockHash,
			BlockHeight: int(tx.BlockHeight),
			Timestamp:   tx.Timestamp,
		},
		Index:         tx.Index,
		Fee:           tx.Fee,
		Confirmations: tx.latestHeight - int(tx.BlockHeight) + 1,
		Events:        tx.Events,
		GasWanted:     "0",
		GasUsed:       "0",
		Messages:      tx.Messages,
		Memo:          tx.Memo,
	}

	return t, nil
}
