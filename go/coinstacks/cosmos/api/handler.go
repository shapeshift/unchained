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
		return nil, errors.Wrap(err, "failed to get apr data")
	}

	i := Info{
		Info:             info.(cosmosapi.Info),
		TotalSupply:      aprData.totalSupply,
		BondedTokens:     aprData.bondedTokens,
		AnnualProvisions: aprData.annualProvisions,
		CommunityTax:     aprData.communityTax,
		APR:              aprData.rate,
	}

	return i, nil
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	account, err := h.Handler.GetAccount(pubkey)
	if err != nil {
		return nil, err
	}

	stakingData, err := h.getStakingData(pubkey)
	if err != nil {
		return nil, err
	}

	a := &Account{
		Account:       account.(cosmosapi.Account),
		Delegations:   stakingData.Delegations,
		Redelegations: stakingData.Redelegations,
		Unbondings:    stakingData.Unbondings,
		Rewards:       stakingData.Rewards,
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
		totalSupply, err := h.HTTPClient.GetTotalSupply(h.Denom)
		if err != nil {
			return err
		}

		bTotalSupply, _, err := new(big.Float).Parse(totalSupply, 10)

		aprData.totalSupply = totalSupply
		aprData.bTotalSupply = bTotalSupply

		return err
	})

	g.Go(func() error {
		annualProvisions, err := h.HTTPClient.GetAnnualProvisions()
		if err != nil {
			return err
		}

		bAnnualProvisions, _, err := new(big.Float).Parse(annualProvisions, 10)

		aprData.annualProvisions = annualProvisions
		aprData.bAnnualProvisions = bAnnualProvisions

		return err
	})

	g.Go(func() error {
		communityTax, err := h.HTTPClient.GetCommunityTax()
		if err != nil {
			return err
		}

		bCommunityTax, _, err := new(big.Float).Parse(communityTax, 10)

		aprData.communityTax = communityTax
		aprData.bCommunityTax = bCommunityTax

		return err
	})

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

	err := g.Wait()

	// stakingAPR = [Inflation * (1-Community Tax)] / Bonded Tokens Ratio
	bInflationRate := new(big.Float).Quo(aprData.bAnnualProvisions, aprData.bTotalSupply)
	bBondedTokenRatio := new(big.Float).Quo(aprData.bBondedTokens, aprData.bTotalSupply)
	bRewardRate := new(big.Float).Mul(bInflationRate, (new(big.Float).Sub(big.NewFloat(1), aprData.bCommunityTax)))
	apr := new(big.Float).Quo(bRewardRate, bBondedTokenRatio)

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
