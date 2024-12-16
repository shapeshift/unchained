package cosmos

import (
	bankTypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	mintTypes "github.com/cosmos/cosmos-sdk/x/mint/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetTotalSupply(denom string) (string, error) {
	var res struct {
		Amount struct {
			Amount string `json:"amount"`
			Denom  string `json:"denom"`
		} `json:"amount"`
	}

	queryParams := map[string]string{
		"denom": denom,
	}

	_, err := c.LCD.R().SetResult(&res).SetQueryParams(queryParams).Get("/cosmos/bank/v1beta1/supply/by_denom")
	if err != nil {
		return "0", errors.Wrapf(err, "failed to get total supply of: %s", denom)
	}

	return res.Amount.Amount, nil
}

func (c *HTTPClient) GetAnnualProvisions() (string, error) {
	var res struct {
		AnnualProvisions string `json:"annual_provisions"`
	}

	_, err := c.LCD.R().SetResult(&res).Get("/cosmos/mint/v1beta1/annual_provisions")
	if err != nil {
		return "0", errors.Wrap(err, "failed to get annual provisions")
	}

	return res.AnnualProvisions, nil
}

func (c *HTTPClient) GetCommunityTax() (string, error) {
	var res struct {
		Params struct {
			CommunityTax string `json:"community_tax"`
		} `json:"params"`
	}

	_, err := c.LCD.R().SetResult(&res).Get("/cosmos/distribution/v1beta1/params")
	if err != nil {
		return "0", errors.Wrap(err, "failed to get community tax")
	}

	return res.Params.CommunityTax, nil
}

func (c *HTTPClient) GetBondedTokens() (string, error) {
	var res struct {
		Pool struct {
			BondedTokens string `json:"bonded_tokens"`
		} `json:"pool"`
	}

	_, err := c.LCD.R().SetResult(&res).Get("/cosmos/staking/v1beta1/pool")
	if err != nil {
		return "0", errors.Wrap(err, "failed to get bonded tokens")
	}

	return res.Pool.BondedTokens, nil
}

func (c *GRPCClient) GetTotalSupply(denom string) (string, error) {
	res, err := c.bank.SupplyOf(c.ctx, &bankTypes.QuerySupplyOfRequest{Denom: denom})
	if err != nil {
		return "0", errors.Wrapf(err, "failed to get total supply of: %s", denom)
	}

	return res.Amount.Amount.String(), nil
}

func (c *GRPCClient) GetAnnualProvisions() (string, error) {
	res, err := c.mint.AnnualProvisions(c.ctx, &mintTypes.QueryAnnualProvisionsRequest{})
	if err != nil {
		return "0", errors.Wrap(err, "failed to get annual provisions")
	}

	return res.AnnualProvisions.String(), nil
}

func (c *GRPCClient) GetCommunityTax() (string, error) {
	res, err := c.distribution.Params(c.ctx, &distributiontypes.QueryParamsRequest{})
	if err != nil {
		return "0", errors.Wrap(err, "failed to get community tax")
	}

	return res.Params.CommunityTax.String(), nil
}

func (c *GRPCClient) GetBondedTokens() (string, error) {
	res, err := c.staking.Pool(c.ctx, &stakingtypes.QueryPoolRequest{})
	if err != nil {
		return "0", errors.Wrap(err, "failed to get bonded tokens")
	}

	return res.Pool.BondedTokens.String(), nil
}
