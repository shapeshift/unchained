package api

import (
	"github.com/shapeshift/go-unchained/pkg/api"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
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
	// required: true
	Delegations []cosmos.Delegation `json:"delegations"`
	// required: true
	Redelegations []cosmos.Redelegation `json:"redelegations"`
	// required: true
	Unbondings []cosmos.Unbonding `json:"unbondings"`
	// required: true
	Rewards []cosmos.Value `json:"rewards"`
}

type Tx struct {
	api.BaseTx
	Fee       cosmos.Value     `json:"fee"`
	GasUsed   string           `json:"gasUsed"`
	GasWanted string           `json:"gasWanted"`
	Index     int              `json:"index"`
	Memo      string           `json:"memo,omitempty"`
	Value     string           `json:"value"`
	Messages  []cosmos.Message `json:"messages"`
	Events    []cosmos.Event   `json:"events"`
}

type TxHistory struct {
	api.BaseTxHistory
	Txs []Tx `json:"txs"`
}
