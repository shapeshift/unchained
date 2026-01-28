package mayachain

import (
	"encoding/json"
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/shared/cosmossdk"
	tendermintjson "github.com/tendermint/tendermint/libs/json"
	"gitlab.com/mayachain/mayanode/common"
)

type TypedEvent interface{}

type EventFee struct {
	TxID       string `json:"tx_id"`
	Coins      string `json:"coins"`
	PoolDeduct string `json:"pool_deduct"`
	SynthUnits string `json:"synth_units"`
}

type EventOutbound struct {
	InTxID string `json:"in_tx_id"`
	ID     string `json:"id"`
	Chain  string `json:"chain"`
	From   string `json:"from"`
	To     string `json:"to"`
	Coin   string `json:"coin"`
	Memo   string `json:"memo"`
}

type EventSwap struct {
	Pool  string `json:"pool"`
	Id    string `json:"id"`
	Chain string `json:"chain"`
	From  string `json:"from"`
	To    string `json:"to"`
	Memo  string `json:"memo"`
}

func ParseBlockEvents(blockEvents []cosmossdk.ABCIEvent) (cosmossdk.EventsByMsgIndex, []TypedEvent, error) {
	typedEvents := make([]TypedEvent, len(blockEvents))
	eventsByMsgIndex := cosmossdk.EventsByMsgIndex{}

	var typedEvent TypedEvent
	for i, event := range blockEvents {
		switch event.Type {
		case "fee":
			typedEvent = &EventFee{}
		case "outbound":
			typedEvent = &EventOutbound{}
		case "swap":
			typedEvent = &EventSwap{}
		default:
			continue
		}

		attrMap := make(map[string]json.RawMessage)
		attributes := make(cosmossdk.ValueByAttribute)
		for _, a := range event.Attributes {
			attributes[a.Key] = a.Value

			// format attribute value as valid json string
			attrMap[a.Key] = json.RawMessage(strconv.Quote(a.Value))
		}

		attrBytes, err := json.Marshal(attrMap)
		if err != nil {
			return nil, nil, err
		}

		if err := tendermintjson.Unmarshal(attrBytes, typedEvent); err != nil {
			return nil, nil, err
		}

		msgIndex := strconv.Itoa(i)
		eventsByMsgIndex[msgIndex] = make(cosmossdk.AttributesByEvent)
		eventsByMsgIndex[msgIndex][event.Type] = attributes
		typedEvents[i] = typedEvent
	}

	return eventsByMsgIndex, typedEvents, nil
}

func typedEventsToMessages(events []TypedEvent) []cosmossdk.Message {
	messages := []cosmossdk.Message{}

	for i, event := range events {
		switch v := event.(type) {
		case *EventOutbound:
			coin, err := common.ParseCoin(v.Coin)
			if err != nil && v.Coin != "" {
				logger.Error(err)
			}

			message := cosmossdk.Message{
				Addresses: []string{v.From, v.To},
				Index:     strconv.Itoa(i),
				Origin:    v.From,
				From:      v.From,
				To:        v.To,
				Type:      "outbound",
				Value: CoinToValue(&sdk.Coin{
					Denom:  coin.Asset.Native(),
					Amount: sdk.NewIntFromBigInt(coin.Amount.BigInt()),
				}),
			}
			messages = append(messages, message)
		}
	}

	return messages
}
