package api

import (
	"math/big"

	"github.com/cometbft/cometbft/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
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
	h.WSClient.BlockEventHandler(func(eventCache map[string]interface{}, blockHeader types.Header, blockEvents []cosmos.ABCIEvent, eventIndex int) (interface{}, []string, error) {
		tx, err := thorchain.GetTxFromBlockEvents(eventCache, blockHeader, blockEvents, eventIndex, h.BlockService.Latest.Height, h.Denom, h.NativeFee)
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
	// Revenue earned by denom
	// required: true
	Revenue map[string]string `json:"revenue"`
}

func (h *Handler) GetAffiliateRevenue(start int, end int) (*AffiliateRevenue, error) {
	total := big.NewInt(0)
	revenueTotal := make(map[string]*big.Int)
	for _, fee := range h.indexer.AffiliateFees {
		if fee.Timestamp >= int64(start) && fee.Timestamp <= int64(end) {
			if amount, ok := new(big.Int).SetString(fee.Amount, 10); ok {
				if _, ok := revenueTotal[fee.Asset]; !ok {
					revenueTotal[fee.Asset] = big.NewInt(0)
				}

				total.Add(total, amount)
				revenueTotal[fee.Asset].Add(revenueTotal[fee.Asset], amount)
			}
		}
	}

	revenue := make(map[string]string)
	for asset, amount := range revenueTotal {
		revenue[asset] = amount.String()
	}

	a := &AffiliateRevenue{
		Addresses: h.indexer.AffiliateAddresses,
		Amount:    total.String(),
		Revenue:   revenue,
	}

	return a, nil
}

func (h *Handler) ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	return thorchain.ParseMessages(msgs, events)
}

func (h *Handler) ParseFee(tx cosmos.SigningTx, txid string) cosmos.Value {
	return thorchain.ParseFee(tx, txid, h.Denom, h.NativeFee)
}
