package api

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

type Handler struct {
	*cosmos.Handler
}

func (h *Handler) ParseMessages(msgs []sdk.Msg) []cosmos.Message {
	return cosmos.ParseMessages(msgs)
}
