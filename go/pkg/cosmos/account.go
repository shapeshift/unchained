package cosmos

import (
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/gogo/protobuf/types"
	"github.com/pkg/errors"
)

type Account struct {
	Address       string
	AccountNumber int
	Sequence      int
}

type Balance struct {
	Amount string
	Assets []Value
}

// Contains info about account details for an address or xpub
// swagger:model Value
type Value struct {
	// required: true
	// example: 123456789
	Amount string
	// required: true
	// example: udenom
	Denom string
}

// GetAccount details
func (c *HTTPClient) GetAccount(address string) (*Account, error) {
	if !isValidAddress(address) {
		return nil, errors.New(fmt.Sprintf("invalid address: %s", address))
	}

	var res struct {
		Account struct {
			Address       string     `json:"address,omitempty"`
			PubKey        *types.Any `json:"public_key,omitempty"`
			AccountNumber uint64     `json:"account_number,omitempty,string"`
			Sequence      uint64     `json:"sequence,omitempty,string"`
		} `json:"account"`
	}
	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/auth/v1beta1/accounts/%s", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get account")
	}

	a := &Account{
		Address:       res.Account.Address,
		AccountNumber: int(res.Account.AccountNumber),
		Sequence:      int(res.Account.Sequence),
	}

	return a, nil
}

// GetBalance details
func (c *HTTPClient) GetBalance(address string, baseDenom string) (*Balance, error) {
	if !isValidAddress(address) {
		return nil, errors.New(fmt.Sprintf("invalid address: %s", address))
	}

	var res struct {
		Balances sdk.Coins `json:"balances"`
	}
	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/cosmos/bank/v1beta1/balances/%s", address))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get balances")
	}

	return balance(res.Balances, baseDenom)
}

// GetAccount details
func (c *GRPCClient) GetAccount(address string) (*Account, error) {
	if !isValidAddress(address) {
		return nil, errors.New(fmt.Sprintf("invalid address: %s", address))
	}

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

// GetBalance details
func (c *GRPCClient) GetBalance(address string, baseDenom string) (*Balance, error) {
	res, err := c.bank.AllBalances(c.ctx, &banktypes.QueryAllBalancesRequest{Address: address})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get balance")
	}

	return balance(res.Balances, baseDenom)
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
