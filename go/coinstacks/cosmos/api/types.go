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
	// required: true
	Delegations []cosmos.Delegation `json:"delegations"`
	// required: true
	Redelegations []cosmos.Redelegation `json:"redelegations"`
	// required: true
	Unbondings []cosmos.Unbonding `json:"unbondings"`
	// required: true
	Rewards []cosmos.Value `json:"rewards"`
}

// Contains info about a transaction
// swagger:model Tx
type Tx struct {
	// swagger:allOf
	api.BaseTx
	// required: true
	Fee cosmos.Value `json:"fee"`
	// required: true
	// example: 888
	GasUsed string `json:"gasUsed"`
	// required: true
	// example: 999
	GasWanted string `json:"gasWanted"`
	// required: true
	// example: 1
	Index int `json:"index"`
	// required: true
	Memo string `json:"memo,omitempty"`
	// required: true
	// 123456789
	Value string `json:"value"`
	// swagger:allOf
	Messages []cosmos.Message `json:"messages"`
	// swagger:allOf
	Events []cosmos.Event `json:"events"`
}

// Contains info about transaction history for an address or xpub
// swagger:model TxHistory
type TxHistory struct {
	// swagger:allOf
	api.BaseTxHistory
	// required: true
	Txs []Tx `json:"txs"`
}

// Contains info about gas Amount
// swagger:model GasAmount
type GasAmount string
