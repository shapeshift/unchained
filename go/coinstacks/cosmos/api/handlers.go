package api

import (
	"github.com/shapeshift/go-unchained/pkg/api"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
)

type Handler struct {
	httpClient *cosmos.HTTPClient
	grpcClient *cosmos.GRPCClient
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
	accRes, err := h.grpcClient.GetAccount(pubkey)
	if err != nil {
		return nil, err
	}

	balRes, err := h.grpcClient.GetBalance(pubkey, "uatom")
	if err != nil {
		return nil, err
	}

	account := &Account{
		BaseAccount: api.BaseAccount{
			Balance: balRes.Amount,
			Pubkey:  accRes.Address,
		},
		AccountNumber: int(accRes.AccountNumber),
		Sequence:      int(accRes.Sequence),
		Assets:        balRes.Assets,
	}

	return account, nil
}

func (h *Handler) GetTxHistory(pubkey string) (api.TxHistory, error) {
	res, err := h.httpClient.GetTxHistory(pubkey)
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
			Messages:  cosmos.Messages(msgs),
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
