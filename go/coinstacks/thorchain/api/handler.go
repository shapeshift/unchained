package api

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/pkg/thorchain"
	"github.com/shapeshift/unchained/shared/api"
	"github.com/shapeshift/unchained/shared/cosmossdk"
)

type Handler struct {
	*thorchain.Handler
}

// Contains info about the running coinstack
// swagger:model Info
type Info struct {
	// swagger:allOf
	cosmossdk.Info
}

func (h *Handler) GetInfo() (api.Info, error) {
	info, err := h.Handler.GetInfo()
	if err != nil {
		return nil, err
	}

	i := Info{Info: info.(cosmossdk.Info)}

	return i, nil
}

// Contains info about account details for an address or xpub
// swagger:model Account
type Account struct {
	// swagger:allOf
	cosmossdk.Account
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	account, err := h.Handler.GetAccount(pubkey)
	if err != nil {
		return nil, err
	}

	acc := account.(cosmossdk.Account)

	denoms := make(map[string]bool)
	for _, asset := range acc.Assets {
		denoms[asset.Denom] = true
	}

	for _, denom := range []string{"tcy", "x/ruji"} {
		if !denoms[denom] {
			acc.Assets = append(acc.Assets, cosmossdk.Value{Amount: "0", Denom: denom})
		}
	}

	a := Account{Account: acc}

	return a, nil
}

func (h *Handler) GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	return thorchain.GetTxHistory(h.Handler, pubkey, cursor, pageSize)
}

func (h *Handler) ParseMessages(msgs []sdk.Msg, events cosmossdk.EventsByMsgIndex) []cosmossdk.Message {
	return thorchain.ParseMessages(msgs, events)
}

func (h *Handler) ParseFee(tx thorchain.SigningTx, txid string) cosmossdk.Value {
	return thorchain.ParseFee(tx, txid, h.Denom, h.NativeFee)
}
