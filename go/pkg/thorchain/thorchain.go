package thorchain

import (
	"math/big"

	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

var logger = log.WithoutFields()

// map thorchain assets to native tendermint denoms
var assetToDenom = map[string]string{
	"THOR.RUNE": "rune",
}

func ParseFee(tx signing.Tx, txid string, denom string) cosmos.Value {
	fee := cosmos.Fee(tx, txid, denom)

	i := new(big.Int)
	i.SetString(fee.Amount, 10)

	// add outbound fee automatically deducted from every transaction but not tracked as an actual tx fee
	// TODO: query and cache value returned from the node at https://daemon.thorchain.shapeshift.com/lcd/thorchain/constants
	fee.Amount = i.Add(i, big.NewInt(2000000)).String()

	return fee
}
