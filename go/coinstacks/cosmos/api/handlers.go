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
		cosmosTx, signingTx, err := cosmos.DecodeTx(h.wsClient.EncodingConfig(), tx.Tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to handle tx: %v", tx.Tx)
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
			Fee:           cosmos.Fee(signingTx, txid, "uatom"),
			GasWanted:     strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:       strconv.Itoa(int(tx.Result.GasUsed)),
			Index:         int(tx.Index),
			Memo:          signingTx.GetMemo(),
			Messages:      cosmos.Messages(cosmosTx.GetMsgs()),
		}

		seen := make(map[string]bool)
		addrs := []string{}

		// check events for addresses
		for _, subEvents := range t.Events {
			for _, subEvent := range subEvents {
				if subEvent.Type == "coin_spent" || subEvent.Type == "coin_received" {
					for _, attribute := range subEvent.Attributes {
						if attribute.Key == "spender" || attribute.Key == "receiver" {
							addr := attribute.Value
							if _, ok := seen[addr]; !ok {
								addrs = append(addrs, addr)
								seen[addr] = true
							}
						}
					}
				}
			}
		}

		// check messages for addresses
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
	aprData, err := h.getAPRData()
	if err != nil {
		return nil, err
	}

	// stakingAPR = [Inflation * (1-Community Tax)] / Bonded Tokens Ratio
	bInflationRate := new(big.Float).Quo(aprData.bAnnualProvisions, aprData.bTotalSupply)
	bBondedTokenRatio := new(big.Float).Quo(aprData.bBondedTokens, aprData.bTotalSupply)
	bRewardRate := new(big.Float).Mul(bInflationRate, (new(big.Float).Sub(big.NewFloat(1), aprData.bCommunityTax)))
	apr := new(big.Float).Quo(bRewardRate, bBondedTokenRatio)

	info := Info{
		BaseInfo: api.BaseInfo{
			Network: "mainnet",
		},
		TotalSupply:      aprData.totalSupply,
		BondedTokens:     aprData.bondedTokens,
		AnnualProvisions: aprData.annualProvisions,
		CommunityTax:     aprData.communityTax,
		APR:              apr.String(),
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

	accountData, err := h.getAccountData(pubkey, "uatom", apr)
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

func (h *Handler) getAPRData() (*APRData, error) {
	aprData := &APRData{}

	g := new(errgroup.Group)

	g.Go(func() error {
		totalSupply, err := h.httpClient.GetTotalSupply("uatom")
		if err != nil {
			return err
		}

		bTotalSupply, _, err := new(big.Float).Parse(totalSupply, 10)

		aprData.totalSupply = totalSupply
		aprData.bTotalSupply = bTotalSupply

		return err
	})

	g.Go(func() error {
		annualProvisions, err := h.httpClient.GetAnnualProvisions()
		if err != nil {
			return err
		}

		bAnnualProvisions, _, err := new(big.Float).Parse(annualProvisions, 10)

		aprData.annualProvisions = annualProvisions
		aprData.bAnnualProvisions = bAnnualProvisions

		return err
	})

	g.Go(func() error {
		communityTax, err := h.httpClient.GetCommunityTax()
		if err != nil {
			return err
		}

		bCommunityTax, _, err := new(big.Float).Parse(communityTax, 10)

		aprData.communityTax = communityTax
		aprData.bCommunityTax = bCommunityTax

		return err
	})

	g.Go(func() error {
		bondedTokens, err := h.httpClient.GetBondedTokens()
		if err != nil {
			return err
		}

		bBondedTokens, _, err := new(big.Float).Parse(bondedTokens, 10)

		aprData.bondedTokens = bondedTokens
		aprData.bBondedTokens = bBondedTokens

		return err
	})

	err := g.Wait()

	return aprData, err
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
