package api

import (
	"math/big"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	"github.com/shapeshift/unchained/coinstacks/thorchain"
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

func (h *Handler) ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	return thorchain.ParseMessages(msgs, events)
}

func (h *Handler) ParseFee(tx signing.Tx, txid string, denom string) cosmos.Value {
	fee := cosmos.Fee(tx, txid, denom)

	i := new(big.Int)
	i.SetString(fee.Amount, 10)

	// add outbound fee automatically deducted from every transaction but not tracked as an actual tx fee
	// TODO: query and cache value returned from the node at https://daemon.thorchain.shapeshift.com/lcd/thorchain/constants
	fee.Amount = i.Add(i, big.NewInt(2000000)).String()

	return fee
}
