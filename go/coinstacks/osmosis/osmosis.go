package osmosis

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	gammtypes "github.com/osmosis-labs/osmosis/x/gamm/types"
	lockuptypes "github.com/osmosis-labs/osmosis/x/lockup/types"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
)

// Messages will parse any osmosis or cosmos-sdk message types
func Messages(msgs []sdk.Msg) []cosmos.Message {
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
		case *lockuptypes.MsgLockTokens:
			message := cosmos.Message{
				Addresses: []string{v.Owner},
				From:      v.Owner,
				Type:      v.Type(),
				Value:     coinToValue(&v.Coins[0]),
			}
			messages = append(messages, message)
			break
		case *gammtypes.MsgJoinPool:
			message := cosmos.Message{
				Addresses: []string{v.Sender},
				From:      v.Sender,
				Type:      v.Type(),
				Value:     coinToValue(&v.TokenInMaxs[0]),
			}
			messages = append(messages, message)
			break
		case *gammtypes.MsgSwapExactAmountIn:
			message := cosmos.Message{
				Addresses: []string{v.Sender},
				From:      v.Sender,
				Type:      v.Type(),
				Value:     coinToValue(&v.TokenIn),
			}
			messages = append(messages, message)
			break
		default:
			unhandledMsgs = append(unhandledMsgs, msg)
		}
	}

	messages = append(messages, cosmos.Messages(unhandledMsgs)...)

	return messages
}
