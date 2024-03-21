package cosmos

import (
	"fmt"
	"math/big"
	"strconv"
	"time"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetAccount(address string) (*AccountResponse, error) {
	var res struct {
		Account struct {
			Type    string `json:"@type"`
			Address string `json:"address"`
			PubKey  struct {
				Type string `json:"@type"`
				Key  string `json:"key"`
			} `json:"pub_key"`
			AccountNumber int `json:"account_number,string"`
			Sequence      int `json:"sequence,string"`
		} `json:"account"`
	}

	_, err := c.LCD.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/auth/v1beta1/accounts/%s", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get account")
	}

	addr := address
	if res.Account.Address != "" {
		addr = res.Account.Address
	}

	a := &AccountResponse{
		Address:       addr,
		AccountNumber: res.Account.AccountNumber,
		Sequence:      res.Account.Sequence,
	}

	return a, nil
}

func (c *HTTPClient) GetBalance(address string, baseDenom string) (*BalanceResponse, error) {
	var res struct {
		Balances   sdk.Coins  `json:"balances"`
		Pagination Pagination `json:"pagination"`
	}

	_, err := c.LCD.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/bank/v1beta1/balances/%s", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get balances")
	}

	return balance(res.Balances, baseDenom)
}

func (c *HTTPClient) GetDelegations(address string, apr *big.Float) ([]Delegation, error) {
	var res struct {
		DelegationResponses []struct {
			Delegation struct {
				DelegatorAddress string `json:"delegator_address"`
				ValidatorAddress string `json:"validator_address"`
				Shares           string `json:"shares"`
			} `json:"delegation"`
			Balance sdk.Coin `json:"balance"`
		} `json:"delegation_responses"`
		Pagination Pagination `json:"pagination"`
	}

	_, err := c.LCD.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/staking/v1beta1/delegations/%s", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get delegations")
	}

	delgations := []Delegation{}
	for _, r := range res.DelegationResponses {
		validator, err := c.GetValidator(r.Delegation.ValidatorAddress, apr)
		if err != nil {
			validator = &Validator{Address: r.Delegation.ValidatorAddress}
		}

		d := Delegation{
			Validator: validator,
			Shares:    r.Delegation.Shares,
			Balance: Value{
				Amount: r.Balance.Amount.String(),
				Denom:  r.Balance.Denom,
			},
		}
		delgations = append(delgations, d)
	}

	return delgations, nil
}

func (c *HTTPClient) GetRedelegations(address string, apr *big.Float) ([]Redelegation, error) {
	type Entry struct {
		CreationHeight int       `json:"creation_height"`
		CompletionTime time.Time `json:"completion_time"`
		InitialBalance string    `json:"initial_balance"`
		SharesDst      string    `json:"shares_dst"`
	}

	var res struct {
		RedelegationResponses []struct {
			Redelegation struct {
				DelegatorAddress    string  `json:"delegator_address"`
				ValidatorSrcAddress string  `json:"validator_src_address"`
				ValidatorDstAddress string  `json:"validator_dst_address"`
				Entries             []Entry `json:"entries"`
			} `json:"redelegation"`
			Entries []struct {
				RedelegationEntry Entry  `json:"redelegation_entry"`
				Balance           string `json:"balance"`
			} `json:"entries"`
		} `json:"redelegation_responses"`
		Pagination Pagination `json:"pagination"`
	}

	_, err := c.LCD.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/staking/v1beta1/delegators/%s/redelegations", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get redelegations")
	}

	redelgations := []Redelegation{}
	for _, r := range res.RedelegationResponses {
		sourceValidator, err := c.GetValidator(r.Redelegation.ValidatorSrcAddress, apr)
		if err != nil {
			sourceValidator = &Validator{Address: r.Redelegation.ValidatorSrcAddress}
		}

		destinationValidator, err := c.GetValidator(r.Redelegation.ValidatorDstAddress, apr)
		if err != nil {
			destinationValidator = &Validator{Address: r.Redelegation.ValidatorDstAddress}
		}

		entries := []RedelegationEntry{}
		for _, e := range r.Entries {
			entry := RedelegationEntry{
				CompletionTime: strconv.FormatInt(e.RedelegationEntry.CompletionTime.Unix(), 10),
				Shares:         e.RedelegationEntry.SharesDst,
				Balance:        e.Balance,
			}

			entries = append(entries, entry)
		}

		redelegation := Redelegation{
			SourceValidator:      sourceValidator,
			DestinationValidator: destinationValidator,
			Entries:              entries,
		}
		redelgations = append(redelgations, redelegation)
	}

	return redelgations, nil
}

func (c *HTTPClient) GetUnbondings(address string, baseDenom string, apr *big.Float) ([]Unbonding, error) {
	var res struct {
		UnbondingResponses []struct {
			DelegatorAddress string `json:"delegator_address"`
			ValidatorAddress string `json:"validator_address"`
			Entries          []struct {
				CreationHeight string    `json:"creation_height"`
				CompletionTime time.Time `json:"completion_time"`
				InitialBalance string    `json:"initial_balance"`
				Balance        string    `json:"balance"`
			} `json:"entries"`
		} `json:"unbonding_responses"`
		Pagination Pagination `json:"pagination"`
	}

	_, err := c.LCD.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/staking/v1beta1/delegators/%s/unbonding_delegations", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get unbondings")
	}

	unbondings := []Unbonding{}
	for _, r := range res.UnbondingResponses {
		validator, err := c.GetValidator(r.ValidatorAddress, apr)
		if err != nil {
			validator = &Validator{Address: r.ValidatorAddress}
		}

		entries := []UnbondingEntry{}
		for _, e := range r.Entries {
			entry := UnbondingEntry{
				CompletionTime: strconv.FormatInt(e.CompletionTime.Unix(), 10),
				Balance:        Value{Amount: e.Balance, Denom: baseDenom},
			}
			entries = append(entries, entry)
		}

		u := Unbonding{
			Validator: validator,
			Entries:   entries,
		}
		unbondings = append(unbondings, u)
	}

	return unbondings, nil
}

func (c *HTTPClient) GetRewards(address string, apr *big.Float) ([]Reward, error) {
	var res struct {
		Rewards []struct {
			ValidatorAddress string `json:"validator_address"`
			Reward           []struct {
				Amount string `json:"amount"`
				Denom  string `json:"denom"`
			} `json:"reward"`
		} `json:"rewards"`
		Total []struct {
			Amount string `json:"amount"`
			Denom  string `json:"denom"`
		} `json:"total"`
	}

	_, err := c.LCD.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/distribution/v1beta1/delegators/%s/rewards", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get unbondings")
	}

	rewards := []Reward{}
	for _, r := range res.Rewards {
		validator, err := c.GetValidator(r.ValidatorAddress, apr)
		if err != nil {
			validator = &Validator{Address: r.ValidatorAddress}
		}

		valRewards := []Value{}
		for _, r := range r.Reward {
			valRewards = append(valRewards, Value(r))
		}

		reward := Reward{
			Validator: validator,
			Rewards:   valRewards,
		}

		rewards = append(rewards, reward)
	}

	return rewards, nil
}

func (c *GRPCClient) GetAccount(address string) (*AccountResponse, error) {
	res, err := c.auth.Account(c.ctx, &authtypes.QueryAccountRequest{Address: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get account")
	}

	account := authtypes.BaseAccount{}
	if err := c.encoding.Codec.Unmarshal(res.Account.Value, &account); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal account")
	}

	a := &AccountResponse{
		Address:       account.Address,
		AccountNumber: int(account.AccountNumber),
		Sequence:      int(account.Sequence),
	}

	return a, nil
}

func (c *GRPCClient) GetBalance(address string, baseDenom string) (*BalanceResponse, error) {
	res, err := c.bank.AllBalances(c.ctx, &banktypes.QueryAllBalancesRequest{Address: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get balance")
	}

	return balance(res.Balances, baseDenom)
}

func (c *GRPCClient) GetDelegations(address string, apr *big.Float) ([]Delegation, error) {
	res, err := c.staking.DelegatorDelegations(c.ctx, &stakingtypes.QueryDelegatorDelegationsRequest{DelegatorAddr: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get delegations")
	}

	delgations := []Delegation{}
	for _, r := range res.DelegationResponses {
		validator, err := c.GetValidator(r.Delegation.ValidatorAddress, apr)
		if err != nil {
			validator = &Validator{Address: r.Delegation.ValidatorAddress}
		}

		d := Delegation{
			Validator: validator,
			Shares:    r.Delegation.Shares.String(),
			Balance: Value{
				Amount: r.Balance.Amount.String(),
				Denom:  r.Balance.Denom,
			},
		}
		delgations = append(delgations, d)
	}

	return delgations, nil
}

func (c *GRPCClient) GetRedelegations(address string, apr *big.Float) ([]Redelegation, error) {
	res, err := c.staking.Redelegations(c.ctx, &stakingtypes.QueryRedelegationsRequest{DelegatorAddr: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get redelegations")
	}

	redelgations := []Redelegation{}
	for _, r := range res.RedelegationResponses {
		sourceValidator, err := c.GetValidator(r.Redelegation.ValidatorSrcAddress, apr)
		if err != nil {
			sourceValidator = &Validator{Address: r.Redelegation.ValidatorSrcAddress}
		}

		destinationValidator, err := c.GetValidator(r.Redelegation.ValidatorDstAddress, apr)
		if err != nil {
			destinationValidator = &Validator{Address: r.Redelegation.ValidatorDstAddress}
		}

		entries := []RedelegationEntry{}
		for _, e := range r.Entries {
			entry := RedelegationEntry{
				CompletionTime: strconv.FormatInt(e.RedelegationEntry.CompletionTime.Unix(), 10),
				Shares:         e.RedelegationEntry.SharesDst.String(),
			}

			entries = append(entries, entry)
		}

		redelegation := Redelegation{
			SourceValidator:      sourceValidator,
			DestinationValidator: destinationValidator,
			Entries:              entries,
		}
		redelgations = append(redelgations, redelegation)
	}

	return redelgations, nil
}

func (c *GRPCClient) GetUnbondings(address string, baseDenom string, apr *big.Float) ([]Unbonding, error) {
	res, err := c.staking.DelegatorUnbondingDelegations(c.ctx, &stakingtypes.QueryDelegatorUnbondingDelegationsRequest{DelegatorAddr: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get unbondings")
	}

	unbondings := []Unbonding{}
	for _, r := range res.UnbondingResponses {
		validator, err := c.GetValidator(r.ValidatorAddress, apr)
		if err != nil {
			validator = &Validator{Address: r.ValidatorAddress}
		}

		entries := []UnbondingEntry{}
		for _, e := range r.Entries {
			entry := UnbondingEntry{
				CompletionTime: strconv.FormatInt(e.CompletionTime.Unix(), 10),
				Balance:        Value{Amount: e.Balance.String(), Denom: baseDenom},
			}
			entries = append(entries, entry)
		}

		u := Unbonding{
			Validator: validator,
			Entries:   entries,
		}
		unbondings = append(unbondings, u)
	}

	return unbondings, nil
}

func (c *GRPCClient) GetRewards(address string, apr *big.Float) ([]Reward, error) {
	res, err := c.distribution.DelegationTotalRewards(c.ctx, &distributiontypes.QueryDelegationTotalRewardsRequest{DelegatorAddress: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get rewards")
	}

	rewards := []Reward{}
	for _, r := range res.Rewards {
		validator, err := c.GetValidator(r.ValidatorAddress, apr)
		if err != nil {
			validator = &Validator{Address: r.ValidatorAddress}
		}

		valRewards := []Value{}
		for _, r := range r.Reward {
			valReward := Value{
				Amount: r.Amount.String(),
				Denom:  r.Denom,
			}
			valRewards = append(valRewards, valReward)
		}

		reward := Reward{
			Validator: validator,
			Rewards:   valRewards,
		}

		rewards = append(rewards, reward)
	}

	return rewards, nil
}

func balance(balances sdk.Coins, baseDenom string) (*BalanceResponse, error) {
	balance := "0"
	assets := []Value{}
	for _, b := range balances {
		if b.Denom == baseDenom {
			balance = b.Amount.String()
			continue
		}
		assets = append(assets, Value{Amount: b.Amount.String(), Denom: b.Denom})
	}

	b := &BalanceResponse{
		Amount: balance,
		Assets: assets,
	}

	return b, nil
}
