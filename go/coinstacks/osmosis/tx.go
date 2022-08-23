package osmosis

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	gammtypes "github.com/osmosis-labs/osmosis/v6/x/gamm/types"
	lockuptypes "github.com/osmosis-labs/osmosis/v6/x/lockup/types"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

func (c *HTTPClient) BroadcastTx(rawTx string) (string, error) {
	return cosmos.Broadcast(c.keplr, rawTx)
}

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
		case *gammtypes.MsgJoinPool:
			message := cosmos.Message{
				Addresses: []string{v.Sender},
				From:      v.Sender,
				Type:      v.Type(),
				Value:     coinToValue(&v.TokenInMaxs[0]),
			}
			messages = append(messages, message)
		case *gammtypes.MsgSwapExactAmountIn:
			message := cosmos.Message{
				Addresses: []string{v.Sender},
				From:      v.Sender,
				Type:      v.Type(),
				Value:     coinToValue(&v.TokenIn),
			}
			messages = append(messages, message)
		default:
			unhandledMsgs = append(unhandledMsgs, msg)
		}
	}

	messages = append(messages, cosmos.Messages(unhandledMsgs)...)

	return messages
}
