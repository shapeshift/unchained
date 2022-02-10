package api

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/pkg/api"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
	"github.com/tendermint/tendermint/types"
)

type Handler struct {
	httpClient *cosmos.HTTPClient
	grpcClient *cosmos.GRPCClient
	wsClient   *cosmos.WSClient
}

func (h *Handler) StartWebsocket() error {
	h.wsClient.TxHandler(func(tx types.EventDataTx) ([]byte, error) {
		blockHeight := strconv.Itoa(int(tx.Height))
		txid := fmt.Sprintf("%X", sha256.Sum256(tx.Tx))

		baseTx := api.BaseTx{
			TxID:        txid,
			BlockHeight: &blockHeight,
		}

		_, signingTx, err := cosmos.DecodeTx(h.wsClient.EncodingConfig(), tx.Tx)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to decode tx: %v", tx.Tx)
		}

		fee := signingTx.GetFee()[0]
		//msgs := cosmosTx.GetMsgs()

		t := Tx{
			BaseTx: baseTx,
			//Events: cosmos.Events(tx.Result.Log),
			Fee: cosmos.Value{
				Amount: fee.Amount.String(),
				Denom:  fee.Denom,
			},
			GasWanted: strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:   strconv.Itoa(int(tx.Result.GasUsed)),
			Index:     int(tx.Index),
			Memo:      signingTx.GetMemo(),
			//Messages:  cosmos.Messages(msgs),
		}

		msg, err := json.Marshal(t)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to marshal tx: %v", t)
		}

		return msg, nil
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

	balRes, err := h.httpClient.GetBalance(pubkey, "uatom")
	if err != nil {
		return nil, err
	}

	delRes, err := h.httpClient.GetDelegations(pubkey)
	if err != nil {
		return nil, err
	}

	redelRes, err := h.httpClient.GetRedelegations(pubkey)
	if err != nil {
		return nil, err
	}

	unbondingsRes, err := h.httpClient.GetUnbondings(pubkey, "uatom")
	if err != nil {
		return nil, err
	}

	rewardsRes, err := h.httpClient.GetRewards(pubkey)
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
		Delegations:   delRes,
		Redelegations: redelRes,
		Unbondings:    unbondingsRes,
		Rewards:       rewardsRes,
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
			Messages:  cosmos.Messages(msgs),
		}

		txs = append(txs, tx)
	}

	txHistory := TxHistory{
		BaseTxHistory: api.BaseTxHistory{
			Pagination: api.Pagination{
				Page:       page,
				TotalPages: res.TotalPages,
			},
			Pubkey: pubkey,
		},
		Txs: txs,
	}

	return txHistory, nil
}

func (h *Handler) SendTx(hex string) (string, error) {
	return h.httpClient.BroadcastTx([]byte(hex))
}
