package thorchain

import "github.com/shapeshift/unchained/internal/log"

var logger = log.WithoutFields()

// map thorchain assets to native tendermint denoms
var assetToDenom = map[string]string{
	"THOR.RUNE": "rune",
}
