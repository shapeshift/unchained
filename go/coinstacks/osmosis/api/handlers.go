package api

import (
	"math/big"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	cosmosapi "github.com/shapeshift/unchained/pkg/cosmos/api"
	"golang.org/x/sync/errgroup"
)

type Handler struct {
	*cosmosapi.Handler
}

func (h *Handler) GetInfo() (api.Info, error) {
	info, err := h.Handler.GetInfo()
	if err != nil {
		return nil, err
	}

	aprData, err := h.getAPRData()
	if err != nil {
		return nil, err
	}

	i := Info{
		Info: info.(cosmosapi.Info),
		APR:  aprData.rate,
	}

	return i, nil
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	account, err := h.Handler.GetAccount(pubkey)
	if err != nil {
		return nil, err
	}

	accountData, err := h.getStakingData(pubkey)
	if err != nil {
		return nil, err
	}

	a := &Account{
		Account:       account.(cosmosapi.Account),
		Delegations:   accountData.Delegations,
		Redelegations: accountData.Redelegations,
		Unbondings:    accountData.Unbondings,
		Rewards:       accountData.Rewards,
	}

	return a, nil
}

func (h *Handler) GetValidators() ([]cosmos.Validator, error) {
	aprData, err := h.getAPRData()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get apr data")
	}

	return h.HTTPClient.GetValidators(aprData.bRate)
}

func (h *Handler) GetValidator(address string) (*cosmos.Validator, error) {
	aprData, err := h.getAPRData()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get apr data")
	}

	return h.HTTPClient.GetValidator(address, aprData.bRate)
}

func (h *Handler) getAPRData() (*APRData, error) {
	aprData := &APRData{}

	g := new(errgroup.Group)

	g.Go(func() error {
		bondedTokens, err := h.HTTPClient.GetBondedTokens()
		if err != nil {
			return err
		}

		bBondedTokens, _, err := new(big.Float).Parse(bondedTokens, 10)

		aprData.bondedTokens = bondedTokens
		aprData.bBondedTokens = bBondedTokens

		return err
	})

	g.Go(func() error {
		epochProvisions, err := h.HTTPClient.GetEpochProvisions()
		if err != nil {
			return err
		}

		bEpochProvisions, _, err := new(big.Float).Parse(epochProvisions, 10)

		aprData.epochProvisions = epochProvisions
		aprData.bEpochProvisions = bEpochProvisions

		return err
	})

	g.Go(func() error {
		stakingDistributions, err := h.HTTPClient.GetStakingDistributions()
		if err != nil {
			return err
		}

		bStakingDistributions, _, err := new(big.Float).Parse(stakingDistributions, 10)

		aprData.stakingDistributions = stakingDistributions
		aprData.bStakingDistributions = bStakingDistributions

		return err
	})

	err := g.Wait()

	totalSupply, _, _ := new(big.Float).Parse("1000000000", 10)
	yearDays, _, _ := new(big.Float).Parse("365", 10)
	yearMintingProvision := new(big.Float).Mul(new(big.Float).Mul(aprData.bEpochProvisions, aprData.bStakingDistributions), yearDays)
	inflation := new(big.Float).Quo(yearMintingProvision, totalSupply)
	ratio := new(big.Float).Quo(aprData.bBondedTokens, totalSupply)
	apr := new(big.Float).Quo(inflation, ratio)

	aprData.rate = apr.String()
	aprData.bRate = apr

	return aprData, err
}

func (h *Handler) getStakingData(pubkey string) (*StakingData, error) {
	aprData, err := h.getAPRData()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get apr data")
	}

	stakingData := &StakingData{}

	g := new(errgroup.Group)

	g.Go(func() error {
		delegations, err := h.HTTPClient.GetDelegations(pubkey, aprData.bRate)
		if err != nil {
			return err
		}

		stakingData.Delegations = delegations
		return nil
	})

	g.Go(func() error {
		redelegations, err := h.HTTPClient.GetRedelegations(pubkey, aprData.bRate)
		if err != nil {
			return err
		}

		stakingData.Redelegations = redelegations
		return nil
	})

	g.Go(func() error {
		unbondings, err := h.HTTPClient.GetUnbondings(pubkey, h.Denom, aprData.bRate)
		if err != nil {
			return err
		}

		stakingData.Unbondings = unbondings
		return nil
	})

	g.Go(func() error {
		rewards, err := h.HTTPClient.GetRewards(pubkey, aprData.bRate)
		if err != nil {
			return err
		}

		stakingData.Rewards = rewards
		return nil
	})

	err = g.Wait()

	return stakingData, err
}
