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

type APRData struct {
	bondedTokens          string
	epochProvisions       string
	stakingDistributions  string
	bBondedTokens         *big.Float
	bEpochProvisions      *big.Float
	bStakingDistributions *big.Float
}

func (a *APRData) calculate() *big.Float {
	totalSupply, _, _ := new(big.Float).Parse("1000000000", 10)
	yearDays, _, _ := new(big.Float).Parse("365", 10)
	yearMintingProvision := new(big.Float).Mul(new(big.Float).Mul(a.bEpochProvisions, a.bStakingDistributions), yearDays)
	inflation := new(big.Float).Quo(yearMintingProvision, totalSupply)
	ratio := new(big.Float).Quo(a.bBondedTokens, totalSupply)

	return new(big.Float).Quo(inflation, ratio)
}

func (a *APRData) Float() *big.Float {
	return a.calculate()
}

func (a *APRData) String() string {
	return a.calculate().String()
}
