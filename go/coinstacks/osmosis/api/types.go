package api

import (
	"math/big"

	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

// Contains info about the running coinstack
// swagger:model Info
type Info struct {
	// swagger:allOf
	api.BaseInfo
	// required: true
	// example: 0.1541068456
	APR string `json:"apr"`
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
	Rewards []cosmos.Reward `json:"rewards"`
}

// Contains info about a transaction
// swagger:model Tx
type Tx struct {
	// swagger:allOf
	api.BaseTx
	// required: true
	Confirmations int `json:"confirmations"`
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
	Index int    `json:"index"`
	Memo  string `json:"memo,omitempty"`
	// required: true
	// 123456789
	Value string `json:"value"`
	// required: true
	Messages []cosmos.Message `json:"messages"`
	// required: true
	Events cosmos.EventsByMsgIndex `json:"events"`
}

// Contains info about transaction history for an address or xpub
// swagger:model TxHistory
type TxHistory struct {
	// swagger:allOf
	api.BaseTxHistory
	// required: true
	Txs []Tx `json:"txs"`
}

type AccountData struct {
	Account       *cosmos.Account
	Balance       *cosmos.Balance
	Delegations   []cosmos.Delegation
	Redelegations []cosmos.Redelegation
	Unbondings    []cosmos.Unbonding
	Rewards       []cosmos.Reward
}

type APRData struct {
	bondedTokens          string
	bBondedTokens         *big.Float
	stakingDistributions  string
	bStakingDistributions *big.Float
	epochProvisions       string
	bEpochProvisions      *big.Float
}
