package mayachain

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	mayatypes "gitlab.com/mayachain/mayanode/x/mayachain/types"
)

func TestParseMessagesSkipsSendWithEmptyAmount(t *testing.T) {
	msgs := []sdk.Msg{
		&mayatypes.MsgSend{},
		&banktypes.MsgSend{},
	}

	messages := ParseMessages(msgs, nil)
	if len(messages) != 0 {
		t.Fatalf("expected no parsed messages, got %d", len(messages))
	}
}
