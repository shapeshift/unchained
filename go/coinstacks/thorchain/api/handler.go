package api

import (
	"math/big"

	abci "github.com/cometbft/cometbft/abci/types"
	"github.com/cometbft/cometbft/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/thorchain"
)

type Handler struct {
	*cosmos.Handler
	indexer *AffiliateFeeIndexer
}

func (h *Handler) StartWebsocket() error {
	h.WSClient.BlockEventHandler(func(eventCache map[string]interface{}, blockHeader types.Header, blockEvents []abci.Event, eventIndex int) (interface{}, []string, error) {
		tx, err := thorchain.GetTxFromBlockEvents(eventCache, blockHeader, blockEvents, eventIndex, h.BlockService.Latest.Height, h.Denom)
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
	return thorchain.GetTxHistory(h.Handler, pubkey, cursor, pageSize)
}

// Contains info about the affiliate revenue earned
// swagger:model AffiliateRevenue
type AffiliateRevenue struct {
	// Affiliate addresses
	// required: true
	Addresses []string `json:"addresses"`
	// Amount earned (RUNE)
	// required: true
	Amount string `json:"amount"`
}

func (h *Handler) GetAffiliateRevenue(start int, end int) (*AffiliateRevenue, error) {
	total := big.NewInt(0)
	for _, fee := range h.indexer.AffiliateFees {
		if fee.Timestamp >= int64(start) && fee.Timestamp <= int64(end) {
			amount := new(big.Int)
			amount.SetString(fee.Amount, 10)
			total.Add(total, amount)
		}
	}

	a := &AffiliateRevenue{
		Addresses: h.indexer.AffiliateAddresses,
		Amount:    total.String(),
	}

	return a, nil
}

func (h *Handler) ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	return thorchain.ParseMessages(msgs, events)
}

func (h *Handler) ParseFee(tx signing.Tx, txid string, denom string) cosmos.Value {
	return thorchain.ParseFee(tx, txid, denom)
}
