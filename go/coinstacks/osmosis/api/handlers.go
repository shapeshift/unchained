package api

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/coinstacks/osmosis"
	"github.com/shapeshift/go-unchained/pkg/api"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
	"github.com/tendermint/tendermint/types"
)

type Handler struct {
	httpClient *cosmos.HTTPClient
	wsClient   *cosmos.WSClient
}

func (h *Handler) StartWebsocket() error {
	h.wsClient.TxHandler(func(tx types.EventDataTx) ([]byte, []string, error) {
		cosmosTx, signingTx, err := cosmos.DecodeTx(h.wsClient.EncodingConfig(), tx.Tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to decode tx: %v", tx.Tx)
		}

		blockHeight := strconv.Itoa(int(tx.Height))

		fees := signingTx.GetFee()
		if len(fees) == 0 {
			fees = []sdk.Coin{{Denom: "uosmo", Amount: sdk.NewInt(0)}}
		} else if len(fees) > 1 {
			logger.Warnf("multiple fees seen: %+v", fees)
		}

		t := Tx{
			// TODO: blockHash and timestamp
			BaseTx: api.BaseTx{
				TxID:        fmt.Sprintf("%X", sha256.Sum256(tx.Tx)),
				BlockHeight: &blockHeight,
			},
			Events: cosmos.Events(tx.Result.Log),
			Fee: cosmos.Value{
				Amount: fees[0].Amount.String(),
				Denom:  fees[0].Denom,
			},
			GasWanted: strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:   strconv.Itoa(int(tx.Result.GasUsed)),
			Index:     int(tx.Index),
			Memo:      signingTx.GetMemo(),
			Messages:  osmosis.Messages(cosmosTx.GetMsgs()),
		}

		msg, err := json.Marshal(t)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to marshal tx: %v", t)
		}

		seen := make(map[string]bool)
		addrs := []string{}
		for _, m := range t.Messages {
			if m.Addresses == nil {
				continue
			}

			// unique set of addresses
			for _, addr := range m.Addresses {
				if _, ok := seen[addr]; !ok {
					addrs = append(addrs, m.Addresses...)
					seen[addr] = true
				}
			}
		}

		return msg, addrs, nil
	})

	err := h.wsClient.Start()
	if err != nil {
		return errors.WithStack(err)
	}

	return nil
}

func (h *Handler) GetInfo() (api.Info, error) {
	info := Info{
		BaseInfo: api.BaseInfo{
			Network: "mainnet",
		},
	}

	return info, nil
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	accRes, err := h.httpClient.GetAccount(pubkey)
	if err != nil {
		return nil, err
	}

	balRes, err := h.httpClient.GetBalance(pubkey, "uosmo")
	if err != nil {
		return nil, err
	}

	account := &Account{
		BaseAccount: api.BaseAccount{
			Balance:            balRes.Amount,
			UnconfirmedBalance: "0",
			Pubkey:             accRes.Address,
		},
		AccountNumber: int(accRes.AccountNumber),
		Sequence:      int(accRes.Sequence),
		Assets:        balRes.Assets,
	}

	return account, nil
}

func (h *Handler) GetTxHistory(pubkey string, page int, pageSize int) (api.TxHistory, error) {
	res, err := h.httpClient.GetTxHistory(pubkey, page, pageSize)
	if err != nil {
		return nil, err
	}

	txs := []Tx{}
	for _, t := range res.Txs {
		fee := t.SigningTx.GetFee()[0]
		msgs := t.CosmosTx.GetMsgs()

		tx := Tx{
			BaseTx: api.BaseTx{
				TxID:        *t.TendermintTx.Hash,
				BlockHeight: t.TendermintTx.Height,
			},
			Events: cosmos.Events(t.TendermintTx.TxResult.Log),
			Fee: cosmos.Value{
				Amount: fee.Amount.String(),
				Denom:  fee.Denom,
			},
			GasWanted: t.TendermintTx.TxResult.GasWanted,
			GasUsed:   t.TendermintTx.TxResult.GasUsed,
			Index:     int(t.TendermintTx.GetIndex()),
			Memo:      t.SigningTx.GetMemo(),
			Messages:  osmosis.Messages(msgs),
		}

		txs = append(txs, tx)
	}

	txHistory := TxHistory{
		BaseTxHistory: api.BaseTxHistory{
			Pubkey: pubkey,
		},
		Txs: txs,
	}

	return txHistory, nil
}

func (h *Handler) SendTx(hex string) (string, error) {
	return h.httpClient.BroadcastTx([]byte(hex))
}
