package api

import (
	"crypto/sha256"
	"fmt"
	"math/big"
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

		txid := fmt.Sprintf("%X", sha256.Sum256(tx.Tx))

		block, err := h.blockService.GetBlock(int(tx.Height))
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to handle tx: %s", txid)
		}

		t := Tx{
			BaseTx: api.BaseTx{
				TxID:        txid,
				BlockHash:   &block.Hash,
				BlockHeight: &block.Height,
				Timestamp:   &block.Timestamp,
			},
			Confirmations: 1,
			Events:        cosmos.Events(tx.Result.Log),
			Fee:           cosmos.Fee(signingTx, txid, "uatom"),
			GasWanted:     strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:       strconv.Itoa(int(tx.Result.GasUsed)),
			Index:         int(tx.Index),
			Memo:          signingTx.GetMemo(),
			Messages:      cosmos.Messages(cosmosTx.GetMsgs()),
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
	totalSupply, err := h.httpClient.GetTotalSupply("uatom")
	if err != nil {
		return nil, err
	}

	annualProvisions, err := h.httpClient.GetAnnualProvisions()
	if err != nil {
		return nil, err
	}

	communityTax, err := h.httpClient.GetCommunityTax()
	if err != nil {
		return nil, err
	}

	bondedTokens, err := h.httpClient.GetBondedTokens()
	if err != nil {
		return nil, err
	}

	bTotalSupply, _, err := new(big.Float).Parse(totalSupply, 10)
	if err != nil {
		return nil, err
	}

	bAnnualProvisions, _, err := new(big.Float).Parse(annualProvisions, 10)
	if err != nil {
		return nil, err
	}

	bCommunityTax, _, err := new(big.Float).Parse(communityTax, 10)
	if err != nil {
		return nil, err
	}

	bBondedTokens, _, err := new(big.Float).Parse(bondedTokens, 10)
	if err != nil {
		return nil, err
	}

	bInflationRate := new(big.Float).Quo(bAnnualProvisions, bTotalSupply)
	bBondedTokenRatio := new(big.Float).Quo(bBondedTokens, bTotalSupply)
	bTaxRate := new(big.Float).Mul(bInflationRate, (new(big.Float).Sub(big.NewFloat(1), bCommunityTax)))
	apr := new(big.Float).Quo(bTaxRate, bBondedTokenRatio)

	info := Info{
		BaseInfo: api.BaseInfo{
			Network: "mainnet",
		},
		TotalSupply:      totalSupply,
		BondedTokens:     bondedTokens,
		AnnualProvisions: annualProvisions,
		CommunityTax:     communityTax,
		APR:              apr,
	}

	return info, nil
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	info, err := h.GetInfo()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get info")
	}

	account, err := h.httpClient.GetAccount(pubkey)
	if err != nil {
		return nil, err
	}

	balance, err := h.httpClient.GetBalance(pubkey, "uatom")
	if err != nil {
		return nil, err
	}

	delegations, err := h.httpClient.GetDelegations(pubkey, info.(Info).APR)
	if err != nil {
		return nil, err
	}

	redelegations, err := h.httpClient.GetRedelegations(pubkey, info.(Info).APR)
	if err != nil {
		return nil, err
	}

	unbondings, err := h.httpClient.GetUnbondings(pubkey, "uatom", info.(Info).APR)
	if err != nil {
		return nil, err
	}

	rewards, err := h.httpClient.GetRewards(pubkey, info.(Info).APR)
	if err != nil {
		return nil, err
	}

	a := &Account{
		BaseAccount: api.BaseAccount{
			Balance:            balance.Amount,
			UnconfirmedBalance: "0",
			Pubkey:             account.Address,
		},
		AccountNumber: int(account.AccountNumber),
		Sequence:      int(account.Sequence),
		Assets:        balance.Assets,
		Delegations:   delegations,
		Redelegations: redelegations,
		Unbondings:    unbondings,
		Rewards:       rewards,
	}

	return a, nil
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
			return nil, errors.Wrap(err, "failed to get tx history")
		}

		tx := Tx{
			BaseTx: api.BaseTx{
				TxID:        *t.TendermintTx.Hash,
				BlockHash:   &block.Hash,
				BlockHeight: &block.Height,
				Timestamp:   &block.Timestamp,
			},
			Confirmations: h.blockService.Latest.Height - height + 1,
			Events:        cosmos.Events(t.TendermintTx.TxResult.Log),
			Fee:           cosmos.Fee(t.SigningTx, *t.TendermintTx.Hash, "uatom"),
			GasWanted:     t.TendermintTx.TxResult.GasWanted,
			GasUsed:       t.TendermintTx.TxResult.GasUsed,
			Index:         int(t.TendermintTx.GetIndex()),
			Memo:          t.SigningTx.GetMemo(),
			Messages:      cosmos.Messages(t.CosmosTx.GetMsgs()),
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

func (h *Handler) GetValidators() ([]cosmos.Validator, error) {
	info, err := h.GetInfo()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get info")
	}

	return h.httpClient.GetValidators(info.(Info).APR)
}

func (h *Handler) GetValidator(address string) (*cosmos.Validator, error) {
	info, err := h.GetInfo()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get info")
	}

	return h.httpClient.GetValidator(address, info.(Info).APR)
}
