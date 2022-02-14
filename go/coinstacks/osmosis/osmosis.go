package osmosis

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
)

// Messages will parse any osmosis or cosmos-sdk message types
func Messages(msgs []sdk.Msg) []cosmos.Message {
	messages := []cosmos.Message{}

	unhandledMsgs := []sdk.Msg{}
	/*for _, msg := range msgs {

			switch v := msg.(type) {
			case *lockuptypes.MsgLockTokens:
				message := cosmos.Message{
					From:  v.Owner,
					Type:  v.Type(),
					Value: &v.Coins[0],
				}
				messages = append(messages, message)
				break
			case *gammtypes.MsgJoinPool:
				message := cosmos.Message{
					From:  v.Sender,
					Type:  v.Type(),
					Value: &v.TokenInMaxs[0],
				}
				messages = append(messages, message)
				break
			case *gammtypes.MsgSwapExactAmountIn:
				message := cosmos.Message{
					From:  v.Sender,
					Type:  v.Type(),
					Value: &v.TokenIn,
				}
				messages = append(messages, message)
				break
			default:
				unhandledMsgs = append(unhandledMsgs, msg)
			}

	}*/

	messages = append(messages, cosmos.Messages(unhandledMsgs)...)

	return messages
}
