package thorchain

import (
	"math/big"

	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

var logger = log.WithoutFields()

func ParseFee(tx signing.Tx, txid string, denom string, nativeFee int) cosmos.Value {
	fee := cosmos.Fee(tx, txid, denom)

	i := new(big.Int)
	i.SetString(fee.Amount, 10)

	// add native fee automatically deducted from every transaction but not tracked as an actual tx fee
	fee.Amount = i.Add(i, big.NewInt(int64(nativeFee))).String()

	return fee
}
