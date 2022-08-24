package api

import (
	"math/big"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/coinstacks/osmosis"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	cosmosapi "github.com/shapeshift/unchained/pkg/cosmos/api"
	"golang.org/x/sync/errgroup"
)

type Handler struct {
	*cosmosapi.Handler
	HTTPClient *osmosis.HTTPClient
}

func (h *Handler) GetInfo() (api.Info, error) {
	info, err := h.Handler.GetInfo()
	if err != nil {
		return nil, err
	}

	aprData, err := h.GetAPRData()
	if err != nil {
		return nil, err
	}

	i := Info{
		Info: info.(cosmosapi.Info),
		APR:  aprData.String(),
	}

	return i, nil
}

func (h *Handler) SendTx(hex string) (string, error) {
	return h.HTTPClient.BroadcastTx(hex)
}

func (h *Handler) ParseMessages(msgs []sdk.Msg) []cosmos.Message {
	return osmosis.ParseMessages(msgs)
}

func (h *Handler) GetAPRData() (cosmosapi.APRData, error) {
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

	return aprData, err
}
