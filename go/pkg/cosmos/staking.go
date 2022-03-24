package cosmos

import (
	"fmt"

	"github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetValidators() ([]Validator, error) {
	var res types.QueryValidatorsResponse

	_, err := c.cosmos.R().SetResult(&res).Get("/cosmos/staking/v1beta1/validators")
	if err != nil {
		return nil, errors.Wrap(err, "failed to get balances")
	}

	fmt.Printf("%+v\n", res)

	return nil, nil
}

func (c *GRPCClient) GetValidators() ([]Validator, error) {
	res, err := c.staking.Validators(c.ctx, &types.QueryValidatorsRequest{})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get balance")
	}

	validators := []Validator{}
	for _, v := range res.Validators {
		unbonding := ValidatorUnbonding{
			Height:    int(v.UnbondingHeight),
			Timestamp: int(v.UnbondingTime.Unix()),
		}

		commission := ValidatorCommission{
			Rate:          v.Commission.Rate.String(),
			MaxRate:       v.Commission.MaxRate.String(),
			MaxChangeRate: v.Commission.MaxChangeRate.String(),
		}

		validator := Validator{
			Address:     v.OperatorAddress,
			Moniker:     v.Description.Moniker,
			Jailed:      v.Jailed,
			Status:      v.Status.String(),
			Tokens:      v.Tokens.String(),
			Shares:      v.DelegatorShares.String(),
			Website:     v.Description.Website,
			Description: v.Description.Details,
			Unbonding:   unbonding,
			Commission:  commission,
		}

		validators = append(validators, validator)
	}

	return validators, nil
}
