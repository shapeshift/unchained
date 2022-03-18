package api

import (
	"crypto/sha256"
	"fmt"
	"strconv"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/tendermint/tendermint/types"
)

type Handler struct {
	httpClient   *cosmos.HTTPClient
	grpcClient   *cosmos.GRPCClient
	wsClient     *cosmos.WSClient
	blockService *cosmos.BlockService
}

func (h *Handler) StartWebsocket() error {
	h.wsClient.TxHandler(func(tx types.EventDataTx) (interface{}, []string, error) {
		cosmosTx, signingTx, err := cosmos.DecodeTx(h.wsClient.EncodingConfig(), tx.Tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to decode tx: %v", tx.Tx)
		}

		blockHeight := strconv.Itoa(int(tx.Height))
		txid := fmt.Sprintf("%X", sha256.Sum256(tx.Tx))

		t := Tx{
			BaseTx: api.BaseTx{
				// TODO: blockHash and timestamp
				TxID:        txid,
				BlockHeight: &blockHeight,
			},
			Events:    cosmos.Events(tx.Result.Log),
			Fee:       cosmos.Fee(signingTx, txid, "uatom"),
			GasWanted: strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:   strconv.Itoa(int(tx.Result.GasUsed)),
			Index:     int(tx.Index),
			Memo:      signingTx.GetMemo(),
			Messages:  cosmos.Messages(cosmosTx.GetMsgs()),
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
					addrs = append(addrs, addr)
					seen[addr] = true
				}
			}
		}

		return t, addrs, nil
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

func (h *Handler) GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	res, err := h.httpClient.GetTxHistory(pubkey, cursor, pageSize)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history")
	}

	txs := []Tx{}
	for _, t := range res.Txs {
		height, err := strconv.Atoi(*t.TendermintTx.Height)
		if err != nil {
			return nil, errors.WithStack(err)
		}

		block, err := h.blockService.GetBlock(height)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to get tx history")
		}

		tx := Tx{
			BaseTx: api.BaseTx{
				TxID:        *t.TendermintTx.Hash,
				BlockHash:   &block.Hash,
				BlockHeight: &block.Height,
				Timestamp:   &block.Timestamp,
			},
			Events:    cosmos.Events(t.TendermintTx.TxResult.Log),
			Fee:       cosmos.Fee(t.SigningTx, *t.TendermintTx.Hash, "uatom"),
			GasWanted: t.TendermintTx.TxResult.GasWanted,
			GasUsed:   t.TendermintTx.TxResult.GasUsed,
			Index:     int(t.TendermintTx.GetIndex()),
			Memo:      t.SigningTx.GetMemo(),
			Messages:  cosmos.Messages(t.CosmosTx.GetMsgs()),
		}

		txs = append(txs, tx)
	}

	txHistory := TxHistory{
		BaseTxHistory: api.BaseTxHistory{
			Pagination: api.Pagination{
				Cursor: res.Cursor,
			},
			Pubkey: pubkey,
		},
		Txs: txs,
	}

	return txHistory, nil
}

func (h *Handler) SendTx(rawTx string) (string, error) {
	return h.httpClient.BroadcastTx(rawTx)
}

func (h *Handler) EstimateGas(rawTx string) (string, error) {
	return h.httpClient.GetEstimateGas(rawTx)
}
