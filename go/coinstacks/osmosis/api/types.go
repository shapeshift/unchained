package api

import (
	"math/big"

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
	// swagger:allOf
	*cosmosapi.Staking
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
