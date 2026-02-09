package thorchain

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	sdkerrors "cosmossdk.io/errors"
	sdkmath "cosmossdk.io/math"
	"cosmossdk.io/simapp/params"
	abcitypes "github.com/cometbft/cometbft/abci/types"
	cometbftjson "github.com/cometbft/cometbft/libs/json"
	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	rpctypes "github.com/cometbft/cometbft/rpc/jsonrpc/types"
	cometbfttypes "github.com/cometbft/cometbft/types"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/shared/api"
	"github.com/shapeshift/unchained/shared/cosmossdk"
	"gitlab.com/thorchain/thornode/v3/common"
	thorchaintypes "gitlab.com/thorchain/thornode/v3/x/thorchain/types"
)

func (c *HTTPClient) GetTx(txid string) (*coretypes.ResultTx, error) {
	res := &rpctypes.RPCResponse{}

	if !strings.HasPrefix(txid, "0x") {
		txid = "0x" + txid
	}

	_, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParam("hash", txid).Get("/tx")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx: %s", txid)
	}

	if res.Error != nil {
		return nil, errors.Wrapf(errors.New(res.Error.Error()), "failed to get tx: %s", txid)
	}

	tx := &coretypes.ResultTx{}
	if err := cometbftjson.Unmarshal(res.Result, tx); err != nil {
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

	_, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParams(queryParams).Get("/tx_search")
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
	if err := cometbftjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal tx search result: %v", res.Result)
	}

	return result, nil
}

func (c *HTTPClient) BroadcastTx(rawTx string) (string, error) {
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

	_, err = c.LCD.R().SetBody(&txtypes.BroadcastTxRequest{TxBytes: txBytes, Mode: txtypes.BroadcastMode_BROADCAST_MODE_SYNC}).SetResult(&res).Post("/cosmos/tx/v1beta1/txs")
	if err != nil {
		return "", errors.Wrap(err, "failed to broadcast transaction")
	}

	if res.TxResponse.Code != 0 {
		message := fmt.Sprintf("failed to broadcast transaction: codespace: %s, code: %d, description", res.TxResponse.Codespace, res.TxResponse.Code)
		return "", sdkerrors.ABCIError(res.TxResponse.Codespace, res.TxResponse.Code, message)
	}

	return res.TxResponse.TxHash, nil
}

func GetTxHistory(handler *Handler, pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	request := func(query string, page int, pageSize int) ([]cosmossdk.HistoryTx, error) {
		// search for any blocks where pubkey was associated with an indexed block event
		result, err := handler.HTTPClient.BlockSearch(query, page, pageSize)
		if err != nil {
			return nil, errors.WithStack(err)
		}

		txs := []cosmossdk.HistoryTx{}
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
				for _, addr := range cosmossdk.GetTxAddrs(tx.Events, tx.Messages) {
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

	sources := TxHistorySources(handler.HTTPClient, pubkey, handler.FormatTx)
	sources["swap"] = cosmossdk.NewTxState(true, fmt.Sprintf(`"outbound.to='%s'"`, pubkey), request)

	res, err := handler.HTTPClient.GetTxHistory(pubkey, cursor, pageSize, sources)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history")
	}

	txHistory := cosmossdk.TxHistory{
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

func ParseEvents(txResult abcitypes.ExecTxResult) cosmossdk.EventsByMsgIndex {
	events := make(cosmossdk.EventsByMsgIndex)

	if txResult.Log != "" {
		logs, err := sdk.ParseABCILogs(txResult.Log)
		if err != nil {
			// transaction error logs are not in json format and will fail to parse
			// return error event with the log message
			events["0"] = cosmossdk.AttributesByEvent{"error": cosmossdk.ValueByAttribute{"message": txResult.Log}}
			return events
		}

		for _, l := range logs {
			msgIndex := strconv.Itoa(int(l.GetMsgIndex()))
			events[msgIndex] = make(cosmossdk.AttributesByEvent)

			for _, e := range l.GetEvents() {
				attributes := make(cosmossdk.ValueByAttribute)
				for _, a := range e.Attributes {
					attributes[a.Key] = a.Value
				}

				events[msgIndex][e.Type] = attributes
			}
		}
	} else {
		for _, e := range txResult.Events {
			attributes := make(cosmossdk.ValueByAttribute)
			for _, a := range e.Attributes {
				attributes[a.Key] = a.Value
			}

			msgIndex := attributes["msg_index"]
			if msgIndex == "" {
				continue
			}

			if e.Type == "message" && attributes["action"] == "" {
				continue
			}

			delete(attributes, "msg_index")

			if events[msgIndex] == nil {
				events[msgIndex] = make(cosmossdk.AttributesByEvent)
			}

			events[msgIndex][e.Type] = attributes
		}
	}

	return events
}

func ParseMessages(msgs []sdk.Msg, events cosmossdk.EventsByMsgIndex) []cosmossdk.Message {
	messages := []cosmossdk.Message{}

	if _, ok := events["0"]["error"]; ok {
		return messages
	}

	for i, msg := range msgs {
		switch v := msg.(type) {
		case *thorchaintypes.MsgSend:
			message := cosmossdk.Message{
				Addresses: []string{v.FromAddress.String(), v.ToAddress.String()},
				Index:     strconv.Itoa(i),
				Origin:    v.FromAddress.String(),
				From:      v.FromAddress.String(),
				To:        v.ToAddress.String(),
				Type:      "send",
				Value:     CoinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		case *thorchaintypes.MsgDeposit:
			to := ""
			coin := v.Coins[0]

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

			message := cosmossdk.Message{
				Addresses: []string{v.Signer.String(), to},
				Index:     strconv.Itoa(i),
				Origin:    v.Signer.String(),
				From:      v.Signer.String(),
				To:        to,
				Type:      "deposit",
				Value: CoinToValue(&sdk.Coin{
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

				message := cosmossdk.Message{
					Addresses: []string{outbound["from"], outbound["to"]},
					Index:     strconv.Itoa(i),
					Origin:    outbound["from"],
					From:      outbound["from"],
					To:        outbound["to"],
					Type:      "outbound",
					Value: CoinToValue(&sdk.Coin{
						Denom:  coin.Asset.Native(),
						Amount: sdkmath.NewIntFromBigInt(coin.Amount.BigInt()),
					}),
				}
				messages = append(messages, message)
			}

			// detect tcy unstake or rune pool withdraw event as a result of the deposit and create a synthetic message for it
			tcyUnstake := events[strconv.Itoa(i)]["tcy_unstake"]
			runePoolWithdraw := events[strconv.Itoa(i)]["rune_pool_withdraw"]
			if tcyUnstake != nil || runePoolWithdraw != nil {
				var msgType string
				switch {
				case tcyUnstake != nil:
					msgType = "tcy_unstake"
				case runePoolWithdraw != nil:
					msgType = "rune_pool_withdraw"
				}

				transfer := events[strconv.Itoa(i)]["transfer"]
				if transfer != nil {
					coin, err := sdk.ParseCoinNormalized(transfer["amount"])
					if err != nil {
						logger.Error(err)
					}

					message := cosmossdk.Message{
						Addresses: []string{transfer["sender"], transfer["recipient"]},
						Index:     strconv.Itoa(i),
						Origin:    transfer["sender"],
						From:      transfer["sender"],
						To:        transfer["recipient"],
						Type:      msgType,
						Value:     CoinToValue(&coin),
					}
					messages = append(messages, message)
				}
			}
		case *thorchaintypes.MsgObservedTxQuorum:
			transfer := events[strconv.Itoa(i)]["transfer"]
			if transfer != nil {
				coin, err := sdk.ParseCoinNormalized(transfer["amount"])
				if err != nil {
					logger.Error(err)
				}

				message := cosmossdk.Message{
					Addresses: []string{transfer["sender"], transfer["recipient"]},
					Index:     strconv.Itoa(i),
					Origin:    transfer["sender"],
					From:      transfer["sender"],
					To:        transfer["recipient"],
					Type:      "tcy_claim",
					Value:     CoinToValue(&coin),
				}
				messages = append(messages, message)
			}
		case *banktypes.MsgSend:
			message := cosmossdk.Message{
				Addresses: []string{v.FromAddress, v.ToAddress},
				Index:     strconv.Itoa(i),
				Origin:    v.FromAddress,
				From:      v.FromAddress,
				To:        v.ToAddress,
				Type:      "send",
				Value:     CoinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		}
	}

	return messages
}

func Fee(tx SigningTx, txid string, denom string) cosmossdk.Value {
	fees := tx.GetFee()

	if len(fees) == 0 {
		fees = []sdk.Coin{{Denom: denom, Amount: sdkmath.NewInt(0)}}
	} else if len(fees) > 1 {
		logger.Warnf("txid: %s - multiple fees detected (defaulting to index 0): %+v", txid, fees)
	}

	return cosmossdk.Value{
		Amount: fees[0].Amount.String(),
		Denom:  fees[0].Denom,
	}
}

// DecodeTx will attempt to decode a raw transaction in the form of
// a base64 encoded string or a protobuf encoded byte slice
func DecodeTx(encoding params.EncodingConfig, rawTx interface{}) (sdk.Tx, SigningTx, error) {
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
	case cometbfttypes.Tx:
		txBytes = rawTx
	default:
		return nil, nil, errors.New("rawTx must be string or []byte")
	}

	tx, err := encoding.TxConfig.TxDecoder()(txBytes)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error decoding transaction from protobuf")
	}

	if _, ok := tx.(SigningTx); ok {
		builder, err := encoding.TxConfig.WrapTxBuilder(tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "error making transaction builder")
		}

		return tx, builder.GetTx(), nil
	} else {
		return tx, &signingTx{}, nil
	}
}

func GetTxFromBlockEvents(eventCache map[string]interface{}, blockHeader cometbfttypes.Header, blockEvents []cosmossdk.ABCIEvent, eventIndex int, latestHeight int, denom string, nativeFee int) (*BlockResultTx, error) {
	// attempt to find matching fee event for txid or use native fee
	matchFee := func(txid string, events []TypedEvent) cosmossdk.Value {
		for _, e := range events {
			switch v := e.(type) {
			case *EventFee:
				if txid == v.TxID {
					coin, err := common.ParseCoin(v.Coins)
					if err != nil && v.Coins != "" {
						logger.Error(err)
					}

					return CoinToValue(&sdk.Coin{
						Denom:  coin.Asset.Native(),
						Amount: sdkmath.NewIntFromBigInt(coin.Amount.BigInt()),
					})
				}
			}
		}

		return cosmossdk.Value{Amount: strconv.Itoa(nativeFee), Denom: denom}
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

	events := eventCache["events"].(cosmossdk.EventsByMsgIndex)
	typedEvents := eventCache["typedEvents"].([]TypedEvent)
	typedEvent := typedEvents[eventIndex]

	tx := &BlockResultTx{
		BlockHash:    blockHeader.Hash().String(),
		BlockHeight:  blockHeader.Height,
		Timestamp:    int(blockHeader.Time.Unix()),
		Index:        -1, // synthetic transactions don't have a real tx index
		Events:       cosmossdk.EventsByMsgIndex{"0": events[strconv.Itoa(eventIndex)]},
		Messages:     typedEventsToMessages([]TypedEvent{typedEvent}),
		TypedEvent:   typedEvent,
		latestHeight: latestHeight,
		formatTx:     formatBlockTx,
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

// formatBlockTx creates a synthetic transaction from a BlockEndEvent
func formatBlockTx(tx *BlockResultTx) (*cosmossdk.Tx, error) {
	t := &cosmossdk.Tx{
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
