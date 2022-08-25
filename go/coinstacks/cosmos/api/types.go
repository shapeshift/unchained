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

// Contains info about account details for an address or xpub
// swagger:model Account
type Account struct {
	// swagger:allOf
	cosmosapi.Account
	// swagger:allOf
	*cosmosapi.Staking
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
