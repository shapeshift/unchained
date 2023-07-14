package thorchain

import (
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"gitlab.com/thorchain/thornode/common"
	thorchaintypes "gitlab.com/thorchain/thornode/x/thorchain/types"
)

// ParseMessages will parse any thorchain or cosmos-sdk message types
func ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	messages := []cosmos.Message{}

	if _, ok := events["0"]["error"]; ok {
		return messages
	}

	coinToValue := func(c common.Coin) cosmos.Value {
		denom, ok := assetToDenom[c.Asset.String()]
		if !ok {
			denom = c.Asset.String()
		}

		return cosmos.Value{
			Amount: c.Amount.String(),
			Denom:  denom,
		}
	}

	unhandledMsgs := []sdk.Msg{}
	for i, msg := range msgs {
		switch v := msg.(type) {
		case *thorchaintypes.MsgSend:
			message := cosmos.Message{
				Addresses: []string{v.FromAddress.String(), v.ToAddress.String()},
				Index:     strconv.Itoa(i),
				Origin:    v.FromAddress.String(),
				From:      v.FromAddress.String(),
				To:        v.ToAddress.String(),
				Type:      v.Type(),
				Value:     cosmos.CoinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		case *thorchaintypes.MsgDeposit:
			to := events[strconv.Itoa(i)]["transfer"]["recipient"]
			events[strconv.Itoa(i)]["message"]["memo"] = v.Memo // add memo value from message to events

			message := cosmos.Message{
				Addresses: []string{v.Signer.String(), to},
				Index:     strconv.Itoa(i),
				Origin:    v.Signer.String(),
				From:      v.Signer.String(),
				To:        to,
				Type:      v.Type(),
				Value:     coinToValue(v.Coins[0]),
			}
			messages = append(messages, message)
		default:
			unhandledMsgs = append(unhandledMsgs, msg)
		}
	}

	messages = append(messages, cosmos.ParseMessages(unhandledMsgs, events)...)

	return messages
}
