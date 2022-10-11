package thorchain

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/pkg/cosmos"
	thorchaintypes "gitlab.com/thorchain/thornode/x/thorchain/types"
)

// map thorchain assets to native tendermint denoms
var assetToDenom = map[string]string{
	"THOR.RUNE": "rune",
}

// ParseMessages will parse any thorchain or cosmos-sdk message types
func ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	messages := []cosmos.Message{}

	coinToValue := func(c *sdk.Coin) cosmos.Value {
		return cosmos.Value{
			Amount: c.Amount.String(),
			Denom:  c.Denom,
		}
	}

	unhandledMsgs := []sdk.Msg{}
	for _, msg := range msgs {
		switch v := msg.(type) {
		case *thorchaintypes.MsgSend:
			message := cosmos.Message{
				Addresses: []string{v.FromAddress.String(), v.ToAddress.String()},
				Origin:    v.FromAddress.String(),
				From:      v.FromAddress.String(),
				To:        v.ToAddress.String(),
				Type:      v.Type(),
				Value:     coinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		default:
			unhandledMsgs = append(unhandledMsgs, msg)
		}
	}

	messages = append(messages, cosmos.ParseMessages(unhandledMsgs, events)...)

	return messages
}
