package api

import (
	"math/big"

	"github.com/shapeshift/unchained/pkg/cosmos"
)

// Contains info about the running coinstack
// swagger:model Info
type Info struct {
	// swagger:allOf
	cosmos.Info
	// required: true
	// example: 0.1541068456
	APR string `json:"apr"`
}

// Contains info about account details for an address or xpub
// swagger:model Account
type Account struct {
	// swagger:allOf
	cosmos.Account
	// swagger:allOf
	*cosmos.Staking
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
