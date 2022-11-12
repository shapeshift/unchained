package osmosis

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	gammtypes "github.com/osmosis-labs/osmosis/v6/x/gamm/types"
	lockuptypes "github.com/osmosis-labs/osmosis/v6/x/lockup/types"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

// ParseMessages will parse any osmosis or cosmos-sdk message types
func ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	messages := []cosmos.Message{}

	unhandledMsgs := []sdk.Msg{}
	for _, msg := range msgs {
		switch v := msg.(type) {
		case *lockuptypes.MsgLockTokens:
			message := cosmos.Message{
				Addresses: []string{v.Owner},
				From:      v.Owner,
				Type:      v.Type(),
				Value:     cosmos.CoinToValue(&v.Coins[0]),
			}
			messages = append(messages, message)
		case *gammtypes.MsgJoinPool:
			message := cosmos.Message{
				Addresses: []string{v.Sender},
				From:      v.Sender,
				Type:      v.Type(),
				Value:     cosmos.CoinToValue(&v.TokenInMaxs[0]),
			}
			messages = append(messages, message)
		case *gammtypes.MsgSwapExactAmountIn:
			message := cosmos.Message{
				Addresses: []string{v.Sender},
				Origin:    v.Sender,
				From:      v.Sender,
				Type:      v.Type(),
				Value:     cosmos.CoinToValue(&v.TokenIn),
			}
			messages = append(messages, message)
		default:
			unhandledMsgs = append(unhandledMsgs, msg)
		}
	}

	messages = append(messages, cosmos.ParseMessages(unhandledMsgs, events)...)

	return messages
}
