package osmosis

import (
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
	gammtypes "github.com/osmosis-labs/osmosis/v6/x/gamm/types"
	lockuptypes "github.com/osmosis-labs/osmosis/v6/x/lockup/types"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

// ParseMessages will parse any osmosis or cosmos-sdk message types
func ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	messages := []cosmos.Message{}

	if _, ok := events["0"]["error"]; ok {
		return messages
	}

	unhandledMsgs := []sdk.Msg{}
	for i, msg := range msgs {
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
			sender := events[strconv.Itoa(i)]["transfer"]["sender"]
			recipient := events[strconv.Itoa(i)]["transfer"]["recipient"]
			swappedTokensOut := events[strconv.Itoa(i)]["token_swapped"]["tokens_out"]

			// NOTE: attributes with the same key step on each other currently
			// use the guaranteed message.Sender value to find the correct recipient address
			if sender != v.Sender {
				recipient = sender
			}

			tokenOut, err := sdk.ParseCoinNormalized(swappedTokensOut)
			if err != nil && swappedTokensOut != "" {
				logger.Error(err)
			}

			msgs := []cosmos.Message{
				// token in (sell)
				{
					Addresses: []string{v.Sender, recipient},
					Origin:    v.Sender,
					From:      v.Sender,
					To:        recipient,
					Type:      v.Type(),
					Value:     cosmos.CoinToValue(&v.TokenIn),
				},
				// token out (buy)
				{
					Addresses: []string{v.Sender, recipient},
					Origin:    v.Sender,
					From:      recipient,
					To:        v.Sender,
					Type:      v.Type(),
					Value:     cosmos.CoinToValue(&tokenOut),
				},
			}
			messages = append(messages, msgs...)
		default:
			unhandledMsgs = append(unhandledMsgs, msg)
		}
	}

	messages = append(messages, cosmos.ParseMessages(unhandledMsgs, events)...)

	return messages
}
