package thorchain

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	thorchaintypes "gitlab.com/thorchain/thornode/v3/x/thorchain/types"
)

func TestParseMessagesSkipsSendWithEmptyAmount(t *testing.T) {
	msgs := []sdk.Msg{
		&thorchaintypes.MsgSend{},
		&banktypes.MsgSend{},
	}

	messages := ParseMessages(msgs, nil)
	if len(messages) != 0 {
		t.Fatalf("expected no parsed messages, got %d", len(messages))
	}
}
