package api

import (
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

// Contains info about the running coinstack
// swagger:model Info
type Info struct {
	// swagger:allOf
	api.BaseInfo
}

// Contains info about account details for an address or xpub
// swagger:model Account
type Account struct {
	// swagger:allOf
	api.BaseAccount
	// required: true
	// example: 420
	AccountNumber int `json:"accountNumber"`
	// required: true
	// example: 69
	Sequence int `json:"sequence"`
	// required: true
	Assets []cosmos.Value `json:"assets"`
}

type Tx struct {
	api.BaseTx
	Fee       cosmos.Value           `json:"fee"`
	GasUsed   string                 `json:"gasUsed"`
	GasWanted string                 `json:"gasWanted"`
	Index     int                    `json:"index"`
	Memo      string                 `json:"memo,omitempty"`
	Value     string                 `json:"value"`
	Messages  []cosmos.Message       `json:"messages"`
	Events    map[int][]cosmos.Event `json:"events"`
}

type TxHistory struct {
	api.BaseTxHistory
	Txs []Tx `json:"txs"`
}
