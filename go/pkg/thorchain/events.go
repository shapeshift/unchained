package thorchain

import (
	"encoding/json"
	"strconv"
	"strings"

	abci "github.com/cometbft/cometbft/abci/types"
	tmjson "github.com/cometbft/cometbft/libs/json"
	"github.com/shapeshift/unchained/pkg/cosmos"
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

func ParseBlockEvents(events []abci.Event) (cosmos.EventsByMsgIndex, []TypedEvent, error) {
	typedEvents := make([]TypedEvent, len(events))
	eventsByMsgIndex := cosmos.EventsByMsgIndex{}

	var typedEvent TypedEvent
	for i, event := range events {
		switch event.Type {
		case "fee":
			typedEvent = &EventFee{}
		case "outbound":
			typedEvent = &EventOutbound{}
		default:
			continue
		}

		attrMap := make(map[string]json.RawMessage)
		attributes := make(cosmos.ValueByAttribute)
		for _, a := range event.Attributes {
			attributes[string(a.Key)] = string(a.Value)

			// format attribute value as valid json string
			attrMap[string(a.Key)] = json.RawMessage(strconv.Quote(string(a.Value)))
		}

		attrBytes, err := json.Marshal(attrMap)
		if err != nil {
			return nil, nil, err
		}

		if err := tmjson.Unmarshal(attrBytes, typedEvent); err != nil {
			return nil, nil, err
		}

		msgIndex := strconv.Itoa(i)
		eventsByMsgIndex[msgIndex] = make(cosmos.AttributesByEvent)
		eventsByMsgIndex[msgIndex][event.Type] = attributes
		typedEvents[i] = typedEvent
	}

	return eventsByMsgIndex, typedEvents, nil
}

func coinToValue(coin string) cosmos.Value {
	coinParts := strings.Fields(coin)

	denom, ok := assetToDenom[coinParts[1]]
	if !ok {
		denom = coinParts[1]
	}

	return cosmos.Value{
		Amount: coinParts[0],
		Denom:  denom,
	}
}

func typedEventsToMessages(events []TypedEvent) []cosmos.Message {
	messages := []cosmos.Message{}

	for i, event := range events {
		switch v := event.(type) {
		case *EventOutbound:
			message := cosmos.Message{
				Addresses: []string{v.From, v.To},
				Index:     strconv.Itoa(i),
				Origin:    v.From,
				From:      v.From,
				To:        v.To,
				Type:      "outbound",
				Value:     coinToValue(v.Coin),
			}
			messages = append(messages, message)
		}
	}

	return messages
}
