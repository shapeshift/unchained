package api

import (
	"crypto/sha256"
	"fmt"
	"math/big"
	"strconv"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/coinstacks/osmosis"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/tendermint/tendermint/types"
	"golang.org/x/sync/errgroup"
)

type Handler struct {
	httpClient   *cosmos.HTTPClient
	grpcClient   *cosmos.GRPCClient
	wsClient     *cosmos.WSClient
	blockService *cosmos.BlockService
}

func (h *Handler) StartWebsocket() error {
	h.wsClient.TxHandler(func(tx types.EventDataTx, block *cosmos.Block) (interface{}, []string, error) {
		osmosisTx, signingTx, err := cosmos.DecodeTx(h.wsClient.EncodingConfig(), tx.Tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to decode tx: %v", tx.Tx)
		}

		txid := fmt.Sprintf("%X", sha256.Sum256(tx.Tx))

		t := Tx{
			BaseTx: api.BaseTx{
				TxID:        txid,
				BlockHash:   &block.Hash,
				BlockHeight: &block.Height,
				Timestamp:   &block.Timestamp,
			},
			Confirmations: 1,
			Events:        cosmos.Events(tx.Result.Log),
			Fee:           cosmos.Fee(signingTx, txid, "uosmo"),
			GasWanted:     strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:       strconv.Itoa(int(tx.Result.GasUsed)),
			Index:         int(tx.Index),
			Memo:          signingTx.GetMemo(),
			Messages:      osmosis.Messages(osmosisTx.GetMsgs()),
		}

		// TODO: check addresses based on events instead of messages
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

// TODO: add osmosis apr
func (h *Handler) GetInfo() (api.Info, error) {

	bondedTokens, err := h.httpClient.GetBondedTokens()

	bondedTokensFloat, err := strconv.ParseFloat(bondedTokens, 64)
	if err != nil {
		return nil, err
	}

	stakingsDistributions, err := h.httpClient.GetStakingDistributions()
	if err != nil {
		return nil, err
	}

	epochProvision, err := h.httpClient.GetEpochProvisions()
	if err != nil {
		return nil, err
	}

	epochProvisionFloat, err := strconv.ParseFloat(epochProvision, 64)
	if err != nil {
		return nil, err
	}
	stakingsDistributionsFloat, err := strconv.ParseFloat(stakingsDistributions, 64)

	if err != nil {
		return nil, err
	}

	mintingEpochProvision := epochProvisionFloat * stakingsDistributionsFloat

	//static
	totalSupply := "1000000000"
	totalSupplyfloat, err := strconv.ParseFloat(totalSupply, 64)
	if err != nil {
		return nil, err
	}

	epochDuration := "86400"
	epochDurationFloat, err := strconv.ParseFloat(epochDuration, 64)
	if err != nil {
		return nil, err
	}

	yearMintingProvision := mintingEpochProvision * ((365 * 24 * 3600) / epochDurationFloat)

	ratio := bondedTokensFloat / totalSupplyfloat

	inflation := yearMintingProvision / totalSupplyfloat

	apr := inflation / ratio

	aprString := fmt.Sprintf("%f", apr)

	info := Info{
		BaseInfo: api.BaseInfo{
			Network: "mainnet",
		},
		APR: aprString,
	}

	return info, nil
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	info, err := h.GetInfo()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get info")
	}

	apr, _, err := new(big.Float).Parse(info.(Info).APR, 10)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse apr: %s", apr)
	}

	accountData, err := h.getAccountData(pubkey, "uosmo", apr)
	if err != nil {
		return nil, err
	}

	a := &Account{
		BaseAccount: api.BaseAccount{
			Balance:            accountData.Balance.Amount,
			UnconfirmedBalance: "0",
			Pubkey:             accountData.Account.Address,
		},
		AccountNumber: int(accountData.Account.AccountNumber),
		Sequence:      int(accountData.Account.Sequence),
		Assets:        accountData.Balance.Assets,
		Delegations:   accountData.Delegations,
		Redelegations: accountData.Redelegations,
		Unbondings:    accountData.Unbondings,
		Rewards:       accountData.Rewards,
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
			Fee:           cosmos.Fee(t.SigningTx, *t.TendermintTx.Hash, "uosmo"),
			GasWanted:     t.TendermintTx.TxResult.GasWanted,
			GasUsed:       t.TendermintTx.TxResult.GasUsed,
			Index:         int(t.TendermintTx.GetIndex()),
			Memo:          t.SigningTx.GetMemo(),
			Messages:      osmosis.Messages(t.CosmosTx.GetMsgs()),
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

	apr, _, err := new(big.Float).Parse(info.(Info).APR, 10)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse apr: %s", apr)
	}

	return h.httpClient.GetValidators(apr)
}

func (h *Handler) GetValidator(address string) (*cosmos.Validator, error) {
	info, err := h.GetInfo()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get info")
	}

	apr, _, err := new(big.Float).Parse(info.(Info).APR, 10)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse apr: %s", apr)
	}

	return h.httpClient.GetValidator(address, apr)
}

func (h *Handler) getAccountData(pubkey string, denom string, apr *big.Float) (*AccountData, error) {
	accountData := &AccountData{}

	g := new(errgroup.Group)

	g.Go(func() error {
		account, err := h.httpClient.GetAccount(pubkey)
		accountData.Account = account
		return err
	})

	g.Go(func() error {
		balance, err := h.httpClient.GetBalance(pubkey, denom)
		accountData.Balance = balance
		return err
	})

	g.Go(func() error {
		delegations, err := h.httpClient.GetDelegations(pubkey, apr)
		accountData.Delegations = delegations
		return err
	})

	g.Go(func() error {
		redelegations, err := h.httpClient.GetRedelegations(pubkey, apr)
		accountData.Redelegations = redelegations
		return err
	})

	g.Go(func() error {
		unbondings, err := h.httpClient.GetUnbondings(pubkey, denom, apr)
		accountData.Unbondings = unbondings
		return err
	})

	g.Go(func() error {
		rewards, err := h.httpClient.GetRewards(pubkey, apr)
		accountData.Rewards = rewards
		return err
	})

	err := g.Wait()

	return accountData, err
}
