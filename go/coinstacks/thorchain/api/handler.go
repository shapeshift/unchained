package api

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

type Handler struct {
	*cosmos.Handler
}

// Contains info about the running coinstack
// swagger:model Info
type Info struct {
	// swagger:allOf
	cosmos.Info
}

func (h *Handler) GetInfo() (api.Info, error) {
	info, err := h.Handler.GetInfo()
	if err != nil {
		return nil, err
	}

	i := Info{Info: info.(cosmos.Info)}

	return i, nil
}

// Contains info about account details for an address or xpub
// swagger:model Account
type Account struct {
	// swagger:allOf
	cosmos.Account
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	account, err := h.Handler.GetAccount(pubkey)
	if err != nil {
		return nil, err
	}

	a := Account{Account: account.(cosmos.Account)}

	return a, nil
}

func (h *Handler) ParseMessages(msgs []sdk.Msg) []cosmos.Message {
	return cosmos.ParseMessages(msgs)
}
