package api

import (
	"math/big"

	"github.com/shapeshift/unchained/pkg/cosmos"
	cosmosapi "github.com/shapeshift/unchained/pkg/cosmos/api"
)

// Contains info about the running coinstack
// swagger:model Info
type Info struct {
	// swagger:allOf
	cosmosapi.Info
	// required: true
	// example: 0.1541068456
	APR string `json:"apr"`
}

// Contains info about account details for an address or xpub
// swagger:model Account
type Account struct {
	// swagger:allOf
	cosmosapi.Account
	// required: true
	Delegations []cosmos.Delegation `json:"delegations"`
	// required: true
	Redelegations []cosmos.Redelegation `json:"redelegations"`
	// required: true
	Unbondings []cosmos.Unbonding `json:"unbondings"`
	// required: true
	Rewards []cosmos.Reward `json:"rewards"`
}

type StakingData struct {
	Delegations   []cosmos.Delegation
	Redelegations []cosmos.Redelegation
	Unbondings    []cosmos.Unbonding
	Rewards       []cosmos.Reward
}

type APRData struct {
	bondedTokens          string
	epochProvisions       string
	rate                  string
	stakingDistributions  string
	bBondedTokens         *big.Float
	bEpochProvisions      *big.Float
	bRate                 *big.Float
	bStakingDistributions *big.Float
}
