package api

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/pkg/cosmos"
	cosmosapi "github.com/shapeshift/unchained/pkg/cosmos/api"
)

type Handler struct {
	*cosmosapi.Handler
}

func (h *Handler) ParseMessages(msgs []sdk.Msg) []cosmos.Message {
	return cosmos.ParseMessages(msgs)
}
