package api

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/pkg/mayachain"
	"github.com/shapeshift/unchained/shared/api"
	"github.com/shapeshift/unchained/shared/cosmossdk"
)

type Handler struct {
	*mayachain.Handler
	indexer *mayachain.AffiliateFeeIndexer
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

	a := Account{Account: account.(cosmossdk.Account)}

	return a, nil
}

func (h *Handler) GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	return mayachain.GetTxHistory(h.Handler, pubkey, cursor, pageSize)
}

// Contains info about affiliate fee history
// swagger:model AffiliateFees
type AffiliateFees struct {
	// Affiliate fees
	// required: true
	Fees []*mayachain.AffiliateFee `json:"fees"`
}

func (h *Handler) GetAffiliateFees(start int, end int) (*AffiliateFees, error) {
	fees := []*mayachain.AffiliateFee{}
	for _, fee := range h.indexer.AffiliateFees {
		if fee.Timestamp >= int64(start) && fee.Timestamp <= int64(end) {
			fees = append(fees, fee)
		}
	}

	a := &AffiliateFees{
		Fees: fees,
	}

	return a, nil
}

func (h *Handler) ParseMessages(msgs []sdk.Msg, events cosmossdk.EventsByMsgIndex) []cosmossdk.Message {
	return mayachain.ParseMessages(msgs, events)
}

func (h *Handler) ParseFee(tx mayachain.SigningTx, txid string) cosmossdk.Value {
	return mayachain.ParseFee(tx, txid, h.Denom, h.NativeFee)
}
