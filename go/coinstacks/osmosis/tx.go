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
			tokenInValues := cosmos.PoolEventAmountToValues(events["0"]["pool_joined"]["tokens_in"])
			msgs := []cosmos.Message{
				// token in 0
				{
					Addresses: []string{v.Sender},
					Origin:    v.Sender,
					From:      v.Sender,
					Type:      v.Type(),
					Value:     tokenInValues[0],
				},
				// token in 1
				{
					Addresses: []string{v.Sender},
					Origin:    v.Sender,
					From:      v.Sender,
					Type:      v.Type(),
					Value:     tokenInValues[1],
				},
				// token out (lp token)
				{
					Addresses: []string{v.Sender},
					Origin:    v.Sender,
					From:      events["0"]["transfer"]["sender"],
					To:        v.Sender,
					Type:      v.Type(),
					Value:     cosmos.SerializedPoolTransferStringtoValue(events["0"]["transfer"]["amount"]),
				},
			}
			messages = append(messages, msgs...)
		case *gammtypes.MsgExitPool:
			tokenOutValues := cosmos.PoolEventAmountToValues(events["0"]["pool_exited"]["tokens_out"])
			msgs := []cosmos.Message{
				// token out 0
				{
					Addresses: []string{v.Sender},
					Origin:    v.Sender,
					To:        v.Sender,
					Type:      v.Type(),
					Value:     tokenOutValues[0],
				},
				// token out 1
				{
					Addresses: []string{v.Sender},
					Origin:    v.Sender,
					To:        v.Sender,
					Type:      v.Type(),
					Value:     tokenOutValues[1],
				},
				// token in (lp token)
				{
					Addresses: []string{v.Sender},
					Origin:    v.Sender,
					From:      v.Sender,
					Type:      v.Type(),
					Value:     cosmos.SerializedPoolTransferStringtoValue(events["0"]["transfer"]["amount"]),
				},
			}
			messages = append(messages, msgs...)
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
