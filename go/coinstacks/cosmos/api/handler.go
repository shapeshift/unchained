package api

import (
	"math/big"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"golang.org/x/sync/errgroup"
)

type Handler struct {
	*cosmos.Handler
}

// Contains info about the running coinstack
// swagger:model Info
type Info struct {
	// swagger:allOf
	cosmos.Info
	// required: true
	// example: 291107634956378
	TotalSupply string `json:"totalSupply"`
	// required: true
	// example: 186039736185555
	BondedTokens string `json:"bondedTokens"`
	// required: true
	// example: 0.1541068456
	APR string `json:"apr"`
	// required: true
	// example: 29255184955917.174457731278996910
	AnnualProvisions string `json:"annualProvisions"`
	// required: true
	// example: 0.020000000000000000
	CommunityTax string `json:"communityTax"`
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
		Info:             info.(cosmos.Info),
		TotalSupply:      aprData.totalSupply,
		BondedTokens:     aprData.bondedTokens,
		AnnualProvisions: aprData.annualProvisions,
		CommunityTax:     aprData.communityTax,
		APR:              aprData.rate,
	}

	return i, nil
}

// Contains info about account details for an address or xpub
// swagger:model Account
type Account struct {
	// swagger:allOf
	cosmos.Account
	// swagger:allOf
	*cosmos.Staking
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

func (h *Handler) GetValidators(cursor string, pageSize int) (*cosmos.Validators, error) {
	aprData, err := h.getAPRData()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get apr data")
	}

	res, err := h.HTTPClient.GetValidators(aprData.bRate, cursor, pageSize)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get validators")
	}

	v := &cosmos.Validators{
		Validators: res.Validators,
		Pagination: api.Pagination{
			Cursor: res.Pagination.NextKey,
		},
	}

	return v, nil
}

func (h *Handler) GetValidator(address string) (*cosmos.Validator, error) {
	aprData, err := h.getAPRData()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get apr data")
	}

	return h.HTTPClient.GetValidator(address, aprData.bRate)
}

func (h *Handler) ParseMessages(msgs []sdk.Msg, events cosmos.EventsByMsgIndex) []cosmos.Message {
	return cosmos.ParseMessages(msgs, events)
}

func (h *Handler) ParseFee(tx signing.Tx, txid string, denom string) cosmos.Value {
	return cosmos.Fee(tx, txid, denom)
}

type APRData struct {
	annualProvisions  string
	bondedTokens      string
	communityTax      string
	rate              string
	totalSupply       string
	bAnnualProvisions *big.Float
	bBondedTokens     *big.Float
	bCommunityTax     *big.Float
	bRate             *big.Float
	bTotalSupply      *big.Float
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

	if err := g.Wait(); err != nil {
		return nil, err
	}

	// stakingAPR = [Inflation * (1-Community Tax)] / Bonded Tokens Ratio
	bInflationRate := new(big.Float).Quo(aprData.bAnnualProvisions, aprData.bTotalSupply)
	bBondedTokenRatio := new(big.Float).Quo(aprData.bBondedTokens, aprData.bTotalSupply)
	bRewardRate := new(big.Float).Mul(bInflationRate, (new(big.Float).Sub(big.NewFloat(1), aprData.bCommunityTax)))

	aprData.bRate = new(big.Float).Quo(bRewardRate, bBondedTokenRatio)
	aprData.rate = aprData.bRate.String()

	return aprData, nil
}

// Contains info about the current fees
// swagger:model Fees
type Fees map[string]string

func (h *Handler) GetFees() (*Fees, error) {
	globalMinGasPrices, err := h.HTTPClient.GetGlobalMinimumGasPrices()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get global minimum gas prices")
	}

	localMinGasPrice, err := h.HTTPClient.GetLocalMinimumGasPrices()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get local minimum gas prices")
	}

	minGasPrices := make(Fees)
	for k, global := range globalMinGasPrices {
		minGasPrices[k] = global.String()
		if local, ok := localMinGasPrice[k]; ok {
			if local.GT(global) {
				minGasPrices[k] = local.String()
			}
		}
	}

	return &minGasPrices, nil
}
