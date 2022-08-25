package api

import (
	"math/big"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/coinstacks/osmosis"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"golang.org/x/sync/errgroup"
)

type Handler struct {
	*cosmos.Handler
	HTTPClient *osmosis.HTTPClient
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
		Info: info.(cosmos.Info),
		APR:  aprData.rate,
	}

	return i, nil
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	a := Account{}

	aprData, err := h.getAPRData()
	if err != nil {
		return nil, err
	}

	g := new(errgroup.Group)

	g.Go(func() error {
		account, err := h.Handler.GetAccount(pubkey)
		if err != nil {
			return err
		}

		a.Account = account.(cosmos.Account)

		return nil
	})

	g.Go(func() error {
		staking, err := h.Handler.GetStaking(pubkey, aprData.bRate)
		if err != nil {
			return err
		}

		a.Staking = staking

		return nil
	})

	if err := g.Wait(); err != nil {
		return nil, err
	}

	return a, nil
}

func (h *Handler) SendTx(hex string) (string, error) {
	return h.HTTPClient.BroadcastTx(hex)
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

func (h *Handler) ParseMessages(msgs []sdk.Msg) []cosmos.Message {
	return osmosis.ParseMessages(msgs)
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

	if err := g.Wait(); err != nil {
		return nil, err
	}

	totalSupply, _, _ := new(big.Float).Parse("1000000000", 10)
	yearDays, _, _ := new(big.Float).Parse("365", 10)
	yearMintingProvision := new(big.Float).Mul(new(big.Float).Mul(aprData.bEpochProvisions, aprData.bStakingDistributions), yearDays)
	inflation := new(big.Float).Quo(yearMintingProvision, totalSupply)
	ratio := new(big.Float).Quo(aprData.bBondedTokens, totalSupply)

	aprData.bRate = new(big.Float).Quo(inflation, ratio)
	aprData.rate = aprData.bRate.String()

	return aprData, nil
}
