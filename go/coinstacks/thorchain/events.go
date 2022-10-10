package thorchain

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/shapeshift/unchained/pkg/cosmos"
	abci "github.com/tendermint/tendermint/abci/types"
	tmjson "github.com/tendermint/tendermint/libs/json"
)

type TypedEvent interface{}

type EventFee struct {
	TxID       string `json:"tx_id"`
	Coins      string `json:"coins"`
	PoolDeduct string `json:"pool_deduct"`
	SynthUnits string `json:"synth_units"`
}

type EventOutbound struct {
	InTxID      string `json:"in_tx_id"`
	ID          string `json:"id"`
	Chain       string `json:"chain"`
	FromAddress string `json:"from"`
	ToAddress   string `json:"to"`
	Coin        string `json:"coin"`
	Memo        string `json:"memo"`
}

func CoinToValue(coin string) cosmos.Value {
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

func ParseBlockEvents(events []abci.Event) (cosmos.EventsByMsgIndex, []TypedEvent, error) {
	idx := 0
	typedEvents := []TypedEvent{}
	eventsByMsgIndex := cosmos.EventsByMsgIndex{}

	var typedEvent TypedEvent
	for _, event := range events {
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
			attrMap[string(a.Key)] = json.RawMessage(fmt.Sprintf("\"%s\"", string(a.Value)))
		}

		attrBytes, err := json.Marshal(attrMap)
		if err != nil {
			return nil, nil, err
		}

		if err := tmjson.Unmarshal(attrBytes, typedEvent); err != nil {
			return nil, nil, err
		}

		msgIndex := strconv.Itoa(idx)
		eventsByMsgIndex[msgIndex] = make(cosmos.AttributesByEvent)
		eventsByMsgIndex[msgIndex][event.Type] = attributes
		typedEvents = append(typedEvents, typedEvent)
		idx++
	}

	return eventsByMsgIndex, typedEvents, nil
}

func TypedEventsToMessages(events []TypedEvent) []cosmos.Message {
	messages := []cosmos.Message{}

	for _, event := range events {
		switch v := event.(type) {
		case *EventOutbound:
			message := cosmos.Message{
				Addresses: []string{v.FromAddress, v.ToAddress},
				Origin:    v.FromAddress,
				From:      v.FromAddress,
				To:        v.ToAddress,
				Type:      "swap",
				Value:     CoinToValue(v.Coin),
			}
			messages = append(messages, message)
		}
	}

	return messages
}
