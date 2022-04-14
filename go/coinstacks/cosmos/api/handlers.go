package api

import (
	"crypto/sha256"
	"fmt"
	"math/big"
	"strconv"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/websocket"
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
	h.wsClient.TxHandler(func(tx types.EventDataTx, registry websocket.Registry) (interface{}, []string, error) {
		cosmosTx, signingTx, err := cosmos.DecodeTx(h.wsClient.EncodingConfig(), tx.Tx)

		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to decode tx: %v", tx.Tx)
		}

		txid := fmt.Sprintf("%X", sha256.Sum256(tx.Tx))

		Messages := cosmos.Messages(cosmosTx.GetMsgs())

		if len(Messages) > 0 {
			// Dont bother getting blocks for or creating transactions that arent in the registry
			origin := Messages[0].Origin
			to := Messages[0].To
			if !registry.HasRegisteredAddress(registry.GetRegisteredAddresses(), origin) && !registry.HasRegisteredAddress(registry.GetRegisteredAddresses(), to) {
				return nil, nil, errors.Errorf("skipping tx for unregistered address: %s", txid)
			}
		}

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
			Messages:      Messages,
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

func (h *Handler) GetAprData() (string, string, string, string, error) {

	var totalSupply string
	var annualProvisions string
	var communityTax string
	var bondedTokens string
	g := new(errgroup.Group)

	g.Go(func() error {
		var err error
		totalSupply, err = h.httpClient.GetTotalSupply("uatom")
		return err
	})
	g.Go(func() error {
		var err error
		annualProvisions, err = h.httpClient.GetAnnualProvisions()
		return err

	})
	g.Go(func() error {
		var err error
		communityTax, err = h.httpClient.GetCommunityTax()
		return err

	})
	g.Go(func() error {
		var err error
		bondedTokens, err = h.httpClient.GetBondedTokens()
		return err

	})

	err := g.Wait()

	return totalSupply, annualProvisions, communityTax, bondedTokens, err
}

func (h *Handler) GetInfo() (api.Info, error) {
	totalSupply, annualProvisions, communityTax, bondedTokens, err := h.GetAprData()
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

	// stakingAPR = [Inflation * (1-Community Tax)] / Bonded Tokens Ratio
	bInflationRate := new(big.Float).Quo(bAnnualProvisions, bTotalSupply)
	bBondedTokenRatio := new(big.Float).Quo(bBondedTokens, bTotalSupply)
	bRewardRate := new(big.Float).Mul(bInflationRate, (new(big.Float).Sub(big.NewFloat(1), bCommunityTax)))
	apr := new(big.Float).Quo(bRewardRate, bBondedTokenRatio)

	info := Info{
		BaseInfo: api.BaseInfo{
			Network: "mainnet",
		},
		TotalSupply:      totalSupply,
		BondedTokens:     bondedTokens,
		AnnualProvisions: annualProvisions,
		CommunityTax:     communityTax,
		APR:              apr.String(),
	}

	return info, nil
}

func (h *Handler) GetAccountData(pubkey string, denom string, apr *big.Float) (*cosmos.Account, *cosmos.Balance, []cosmos.Delegation, []cosmos.Redelegation, []cosmos.Unbonding, []cosmos.Reward, error) {

	g := new(errgroup.Group)

	var account *cosmos.Account
	var balance *cosmos.Balance
	var delegations []cosmos.Delegation
	var redelegations []cosmos.Redelegation
	var unbondings []cosmos.Unbonding
	var rewards []cosmos.Reward

	g.Go(func() error {
		var err error
		account, err = h.httpClient.GetAccount(pubkey)
		return err
	})
	g.Go(func() error {
		var err error
		balance, err = h.httpClient.GetBalance(pubkey, denom)
		return err
	})
	g.Go(func() error {
		var err error
		delegations, err = h.httpClient.GetDelegations(pubkey, apr)
		return err
	})
	g.Go(func() error {
		var err error
		redelegations, err = h.httpClient.GetRedelegations(pubkey, apr)
		return err
	})
	g.Go(func() error {
		var err error
		unbondings, err = h.httpClient.GetUnbondings(pubkey, denom, apr)
		return err
	})
	g.Go(func() error {
		var err error
		rewards, err = h.httpClient.GetRewards(pubkey, apr)
		return err
	})

	err := g.Wait()

	return account, balance, delegations, redelegations, unbondings, rewards, err
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

	account, balance, delegations, redelegations, unbondings, rewards, err := h.GetAccountData(pubkey, "uatom", apr)
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
