package cosmos

import (
	"fmt"
	"math/big"

	"github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetValidators(apr *big.Float) ([]Validator, error) {
	var res QueryValidatorsResponse

	_, err := c.Cosmos.R().SetResult(&res).Get("/cosmos/staking/v1beta1/validators")
	if err != nil {
		return nil, errors.Wrap(err, "failed to get validators")
	}

	validators := []Validator{}
	for _, v := range res.Validators {
		validators = append(validators, *httpValidator(v, apr))
	}

	return validators, nil
}

func (c *HTTPClient) GetValidator(addr string, apr *big.Float) (*Validator, error) {
	var res QueryValidatorResponse

	_, err := c.Cosmos.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/staking/v1beta1/validators/%s", addr))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get validators")
	}

	return httpValidator(res.Validator, apr), nil
}

func httpValidator(validator ValidatorResponse, apr *big.Float) *Validator {
	unbonding := ValidatorUnbonding{
		Height:    validator.UnbondingHeight,
		Timestamp: int(validator.UnbondingTime.Unix()),
	}

	commission := ValidatorCommission{
		Rate:          validator.Commission.Rate,
		MaxRate:       validator.Commission.MaxRate,
		MaxChangeRate: validator.Commission.MaxChangeRate,
	}

	commissionRate, _, err := new(big.Float).Parse(commission.Rate, 10)
	if err != nil {
		commissionRate = big.NewFloat(0)
	}

	return &Validator{
		Address:     validator.OperatorAddress,
		Moniker:     validator.Description.Moniker,
		Jailed:      validator.Jailed,
		Status:      validator.Status,
		Tokens:      validator.Tokens,
		Shares:      validator.DelegatorShares,
		Website:     validator.Description.Website,
		Description: validator.Description.Details,
		APR:         new(big.Float).Mul(apr, new(big.Float).Sub(big.NewFloat(1), commissionRate)).String(),
		Unbonding:   unbonding,
		Commission:  commission,
	}
}

func (c *GRPCClient) GetValidators(apr *big.Float) ([]Validator, error) {
	res, err := c.staking.Validators(c.ctx, &types.QueryValidatorsRequest{})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get validators")
	}

	validators := []Validator{}
	for _, v := range res.Validators {
		validators = append(validators, *grpcValidator(v, apr))
	}

	return validators, nil
}

func (c *GRPCClient) GetValidator(addr string, apr *big.Float) (*Validator, error) {
	res, err := c.staking.Validator(c.ctx, &types.QueryValidatorRequest{ValidatorAddr: addr})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get validators")
	}

	return grpcValidator(res.Validator, apr), nil
}

func grpcValidator(validator types.Validator, apr *big.Float) *Validator {
	unbonding := ValidatorUnbonding{
		Height:    int(validator.UnbondingHeight),
		Timestamp: int(validator.UnbondingTime.Unix()),
	}

	commission := ValidatorCommission{
		Rate:          validator.Commission.Rate.String(),
		MaxRate:       validator.Commission.MaxRate.String(),
		MaxChangeRate: validator.Commission.MaxChangeRate.String(),
	}

	commissionRate, _, err := new(big.Float).Parse(commission.Rate, 10)
	if err != nil {
		commissionRate = big.NewFloat(0)
	}

	return &Validator{
		Address:     validator.OperatorAddress,
		Moniker:     validator.Description.Moniker,
		Jailed:      validator.Jailed,
		Status:      validator.Status.String(),
		Tokens:      validator.Tokens.String(),
		Shares:      validator.DelegatorShares.String(),
		Website:     validator.Description.Website,
		Description: validator.Description.Details,
		APR:         new(big.Float).Mul(apr, new(big.Float).Sub(big.NewFloat(1), commissionRate)).String(),
		Unbonding:   unbonding,
		Commission:  commission,
	}
}
