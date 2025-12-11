package api

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/mayachain"
	"github.com/tendermint/tendermint/types"
)

type Handler struct {
	*cosmos.Handler
	indexer *AffiliateFeeIndexer
}

func (h *Handler) StartWebsocket() error {
	h.WSClient.BlockEventHandler(func(eventCache map[string]interface{}, blockHeader types.Header, blockEvents []cosmos.ABCIEvent, eventIndex int) (interface{}, []string, error) {
		tx, err := mayachain.GetTxFromBlockEvents(eventCache, blockHeader, blockEvents, eventIndex, h.BlockService.Latest.Height, h.Denom, h.NativeFee)
		if err != nil {
			return nil, nil, errors.Wrap(err, "failed to get txs from end block events")
		}

		if tx == nil {
			return nil, nil, nil
		}

		t, err := tx.FormatTx()
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to format transaction: %s", tx.TxID)
		}

		addrs := cosmos.GetTxAddrs(tx.Events, tx.Messages)

		return t, addrs, nil
	})

	return h.Handler.StartWebsocket()
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

func (h *Handler) GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	return mayachain.GetTxHistory(h.Handler, pubkey, cursor, pageSize)
}

// Contains info about affiliate fee history
// swagger:model AffiliateFees
type AffiliateFees struct {
	// Affiliate fees
	// required: true
	Fees []*AffiliateFee `json:"fees"`
}

func (h *Handler) GetAffiliateFees(start int, end int) (*AffiliateFees, error) {
	fees := []*AffiliateFee{}
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

func (h *Handler) ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	return mayachain.ParseMessages(msgs, events)
}

func (h *Handler) ParseFee(tx cosmos.SigningTx, txid string) cosmos.Value {
	return mayachain.ParseFee(tx, txid, h.Denom, h.NativeFee)
}
