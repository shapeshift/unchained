package cosmos

import (
	"fmt"
	"strconv"
	"time"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/pkg/errors"
)

type Account struct {
	Address       string
	AccountNumber int
	Sequence      int
}

// Contains info about an account balance
// swagger:model Delegation
type Balance struct {
	// required: true
	// example: 123456789
	Amount string `json:"amount"`
	// required: true
	Assets []Value `json:"assets"`
}

// Contains info about a staking delegation
// swagger:model Delegation
type Delegation struct {
	// required: true
	// example: cosmosvaloper1rpgtz9pskr5geavkjz02caqmeep7cwwpv73axj
	Validator string `json:"validator"`
	// required: true
	// example: 123456.789
	Shares string `json:"shares"`
	// required: true
	// example: 123456789
	Balance Value `json:"balance"`
}

// Contains info about a staking redelegation
// swagger:model Redelegation
type Redelegation struct {
	// required: true
	// example: cosmosvaloper1rpgtz9pskr5geavkjz02caqmeep7cwwpv73axj
	SourceValidator string `json:"sourceValidator"`
	// required: true
	// example: cosmosvaloper1ma02nlc7lchu7caufyrrqt4r6v2mpsj90y9wzd
	DestinationValidator string `json:"destinationValidator"`
	// required: true
	Entries []RedelegationEntry `json:"entries"`
}

// Contains info about a redelegation action
// swagger:model RedelegationEntry
type RedelegationEntry struct {
	// required: true
	// example: 1642533407592
	CompletionTime string `json:"completionTime"`
	// required: true
	// example: 123456.789
	Shares string `json:"shares"`
}

// Contains info about staking rewards
// swagger:model Rewards
type Rewards struct {
	// required: true
	Assets []Value `json:"assets"`
}

// Contains info about a staking unbonding
// swagger:model Unbonding
type Unbonding struct {
	// required: true
	// example: cosmosvaloper1rpgtz9pskr5geavkjz02caqmeep7cwwpv73axj
	Validator string `json:"validator"`
	// required: true
	Entries []UnbondingEntry `json:"entries"`
}

// Contains info about an unbonding action
// swagger:model UnbondingEntry
type UnbondingEntry struct {
	// required: true
	// example: 1642533407592
	CompletionTime string `json:"completionTime"`
	// required: true
	// example: 123456789
	Balance Value `json:"balance"`
}

// Contains info about an asset value
// swagger:model Value
type Value struct {
	// required: true
	// example: 123456789
	Amount string `json:"amount"`
	// required: true
	// example: udenom
	Denom string `json:"denom"`
}

func (c *HTTPClient) GetAccount(address string) (*Account, error) {
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

	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/auth/v1beta1/accounts/%s", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get account")
	}

	a := &Account{
		Address:       res.Account.Address,
		AccountNumber: res.Account.AccountNumber,
		Sequence:      res.Account.Sequence,
	}

	return a, nil
}

func (c *HTTPClient) GetBalance(address string, baseDenom string) (*Balance, error) {
	var res struct {
		Balances   sdk.Coins  `json:"balances"`
		Pagination Pagination `json:"pagination"`
	}

	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/bank/v1beta1/balances/%s", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get balances")
	}

	return balance(res.Balances, baseDenom)
}

func (c *HTTPClient) GetDelegations(address string) ([]Delegation, error) {
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

	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/staking/v1beta1/delegations/%s", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get delegations")
	}

	delgations := []Delegation{}
	for _, r := range res.DelegationResponses {
		d := Delegation{
			Validator: r.Delegation.ValidatorAddress,
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

func (c *HTTPClient) GetRedelegations(address string) ([]Redelegation, error) {
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

	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/staking/v1beta1/delegators/%s/redelegations", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get redelegations")
	}

	redelgations := []Redelegation{}
	for _, r := range res.RedelegationResponses {
		entries := []RedelegationEntry{}
		for _, e := range r.Entries {
			entry := RedelegationEntry{
				CompletionTime: strconv.FormatInt(e.RedelegationEntry.CompletionTime.Unix(), 10),
				Shares:         e.RedelegationEntry.SharesDst,
			}

			entries = append(entries, entry)
		}

		redelegation := Redelegation{
			SourceValidator:      r.Redelegation.ValidatorSrcAddress,
			DestinationValidator: r.Redelegation.ValidatorDstAddress,
			Entries:              entries,
		}
		redelgations = append(redelgations, redelegation)
	}

	return redelgations, nil
}

func (c *HTTPClient) GetUnbondings(address string, baseDenom string) ([]Unbonding, error) {
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

	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/staking/v1beta1/delegators/%s/unbonding_delegations", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get unbondings")
	}

	unbondings := []Unbonding{}
	for _, r := range res.UnbondingResponses {
		entries := []UnbondingEntry{}
		for _, e := range r.Entries {
			entry := UnbondingEntry{
				CompletionTime: strconv.FormatInt(e.CompletionTime.Unix(), 10),
				Balance:        Value{Amount: e.Balance, Denom: baseDenom},
			}
			entries = append(entries, entry)
		}

		u := Unbonding{
			Validator: r.ValidatorAddress,
			Entries:   entries,
		}
		unbondings = append(unbondings, u)
	}

	return unbondings, nil
}

func (c *HTTPClient) GetRewards(address string) (*Rewards, error) {
	var res struct {
		UnbondingResponses []struct {
			ValidatorAddress string  `json:"validator_address"`
			Reward           []Value `json:"reward"`
		} `json:"rewards"`
		Total []Value `json:"total"`
	}

	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/distribution/v1beta1/delegators/%s/rewards", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get unbondings")
	}

	rewards := &Rewards{Assets: []Value{}}
	for _, r := range res.Total {
		rewards.Assets = append(rewards.Assets, Value{Amount: r.Amount, Denom: r.Denom})
	}

	return rewards, nil
}

func (c *GRPCClient) GetAccount(address string) (*Account, error) {
	res, err := c.auth.Account(c.ctx, &authtypes.QueryAccountRequest{Address: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get account")
	}

	account := authtypes.BaseAccount{}
	if err := c.encoding.Marshaler.UnmarshalBinaryBare(res.Account.Value, &account); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal account")
	}

	a := &Account{
		Address:       account.Address,
		AccountNumber: int(account.AccountNumber),
		Sequence:      int(account.Sequence),
	}

	return a, nil
}

func (c *GRPCClient) GetBalance(address string, baseDenom string) (*Balance, error) {
	res, err := c.bank.AllBalances(c.ctx, &banktypes.QueryAllBalancesRequest{Address: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get balance")
	}

	return balance(res.Balances, baseDenom)
}

func (c *GRPCClient) GetDelegations(address string) ([]Delegation, error) {
	res, err := c.staking.DelegatorDelegations(c.ctx, &stakingtypes.QueryDelegatorDelegationsRequest{DelegatorAddr: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get delegations")
	}

	delgations := []Delegation{}
	for _, r := range res.DelegationResponses {
		d := Delegation{
			Validator: r.Delegation.ValidatorAddress,
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

func (c *GRPCClient) GetRedelegations(address string) ([]Redelegation, error) {
	res, err := c.staking.Redelegations(c.ctx, &stakingtypes.QueryRedelegationsRequest{DelegatorAddr: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get redelegations")
	}

	redelgations := []Redelegation{}
	for _, r := range res.RedelegationResponses {
		entries := []RedelegationEntry{}
		for _, e := range r.Entries {
			entry := RedelegationEntry{
				CompletionTime: strconv.FormatInt(e.RedelegationEntry.CompletionTime.Unix(), 10),
				Shares:         e.RedelegationEntry.SharesDst.String(),
			}

			entries = append(entries, entry)
		}

		redelegation := Redelegation{
			SourceValidator:      r.Redelegation.ValidatorSrcAddress,
			DestinationValidator: r.Redelegation.ValidatorDstAddress,
			Entries:              entries,
		}
		redelgations = append(redelgations, redelegation)
	}

	return redelgations, nil
}

func (c *GRPCClient) GetUnbondings(address string, baseDenom string) ([]Unbonding, error) {
	res, err := c.staking.DelegatorUnbondingDelegations(c.ctx, &stakingtypes.QueryDelegatorUnbondingDelegationsRequest{DelegatorAddr: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get unbondings")
	}

	unbondings := []Unbonding{}
	for _, r := range res.UnbondingResponses {
		entries := []UnbondingEntry{}
		for _, e := range r.Entries {
			entry := UnbondingEntry{
				CompletionTime: strconv.FormatInt(e.CompletionTime.Unix(), 10),
				Balance:        Value{Amount: e.Balance.String(), Denom: baseDenom},
			}
			entries = append(entries, entry)
		}

		u := Unbonding{
			Validator: r.ValidatorAddress,
			Entries:   entries,
		}
		unbondings = append(unbondings, u)
	}

	return unbondings, nil
}

func (c *GRPCClient) GetRewards(address string) (*Rewards, error) {
	res, err := c.distribution.DelegationTotalRewards(c.ctx, &distributiontypes.QueryDelegationTotalRewardsRequest{DelegatorAddress: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get rewards")
	}

	rewards := &Rewards{Assets: []Value{}}
	for _, r := range res.Total {
		rewards.Assets = append(rewards.Assets, Value{Amount: r.Amount.String(), Denom: r.Denom})
	}

	return rewards, nil
}

func balance(balances sdk.Coins, baseDenom string) (*Balance, error) {
	balance := "0"
	assets := []Value{}
	for _, b := range balances {
		if b.Denom == baseDenom {
			balance = b.Amount.String()
			continue
		}
		assets = append(assets, Value{Amount: b.Amount.String(), Denom: b.Denom})
	}

	b := &Balance{
		Amount: balance,
		Assets: assets,
	}

	return b, nil
}
