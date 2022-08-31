package cosmos

import (
	"github.com/shapeshift/unchained/pkg/api"
)

// Contains common cosmossdk info about account details for an address or xpub
// swagger:model CosmosSDKAccount
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
	Assets []Value `json:"assets"`
}

// Contains info about a transaction log event key/val attribute
// swagger:model Attribute
type Attribute struct {
	// required: true
	// example: action
	Key string `json:"key"`
	// required: true
	// example: /cosmos.bank.v1beta1.MsgSend
	Value string `json:"value"`
}

// Contains info about an attribute value keyed by attribute type
// swagger:model AttributeByKey
type ValueByAttribute map[string]string

// Contains info about a staking delegation
// swagger:model Delegation
type Delegation struct {
	// required: true
	Validator *Validator `json:"validator"`
	// required: true
	// example: 123456.789
	Shares string `json:"shares"`
	// required: true
	// example: 123456789
	Balance Value `json:"balance"`
}

// Contains info about transaction events keyed by message index
// swagger:model EventsByMsgIndex
type EventsByMsgIndex map[string]AttributesByEvent

// Contains info about a transaction log event
// swagger:model Event
type Event struct {
	// required: true
	// example: message
	Type string `json:"type"`
	// required: true
	Attributes []Attribute `json:"attributes"`
}

// Contains info about event attributes keyed by event type
// swagger:model AttributesByEvent
type AttributesByEvent map[string]ValueByAttribute

// Contains common cosmossdk info about the running coinstack
// swagger:model CosmosSDKInfo
type Info struct {
	// swagger:allOf
	api.BaseInfo
}

// Contains info about a transaction message
// swagger:model Message
type Message struct {
	Addresses []string `json:"-"`
	Origin    string   `json:"origin,omitempty"`
	From      string   `json:"from,omitempty"`
	To        string   `json:"to,omitempty"`
	// required: true
	// example: /cosmos.bank.v1beta1.MsgSend
	Type  string `json:"type"`
	Value Value  `json:"value,omitempty"`
}

// Contains info about a staking redelegation
// swagger:model Redelegation
type Redelegation struct {
	// required: true
	SourceValidator *Validator `json:"sourceValidator"`
	// required: true
	DestinationValidator *Validator `json:"destinationValidator"`
	// required: true
	Entries []RedelegationEntry `json:"entries"`
}

// Contains info about a redelegation action
// swagger:model RedelegationEntry
type RedelegationEntry struct {
	// required: true
	// example: 1642533407592
	CompletionTime string `json:"completionTime"`
	// required: true
	// example: 123456.789
	Shares string `json:"shares"`
	// required: true
	// example: 123456
	Balance string `json:"balance"`
}

// Contains info about a validator reward
// swagger:model Reward
type Reward struct {
	// required: true
	Validator *Validator `json:"validator"`
	// required: true
	Rewards []Value `json:"rewards"`
}

// Contains info about current staking state
// swagger:model Staking
type Staking struct {
	// required: true
	Delegations []Delegation `json:"delegations"`
	// required: true
	Redelegations []Redelegation `json:"redelegations"`
	// required: true
	Unbondings []Unbonding `json:"unbondings"`
	// required: true
	Rewards []Reward `json:"rewards"`
}

// Contains info about a transaction
// swagger:model Tx
type Tx struct {
	// swagger:allOf
	api.BaseTx
	// required: true
	Confirmations int `json:"confirmations"`
	// required: true
	Fee Value `json:"fee"`
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
	Messages []Message `json:"messages"`
	// required: true
	Events EventsByMsgIndex `json:"events"`
}

// Contains info about transaction history for an address or xpub
// swagger:model TxHistory
type TxHistory struct {
	// swagger:allOf
	api.BaseTxHistory
	// required: true
	Txs []Tx `json:"txs"`
}

// swagger:parameters GetTx
type TxParam struct {
	// Transaction hash
	// in: path
	// required: true
	TxID string `json:"txid"`
}

// Contains info about a staking unbonding
// swagger:model Unbonding
type Unbonding struct {
	// required: true
	Validator *Validator `json:"validator"`
	// required: true
	Entries []UnbondingEntry `json:"entries"`
}

// Contains info about an unbonding action
// swagger:model UnbondingEntry
type UnbondingEntry struct {
	// required: true
	// example: 1642533407592
	CompletionTime string `json:"completionTime"`
	// required: true
	// example: 123456789
	Balance Value `json:"balance"`
}

// Contains info about validator unbonding settings
// swagger:model ValidatorUnbonding
type ValidatorUnbonding struct {
	// required: true
	// example: 8897990
	Height int `json:"height"`
	// required: true
	// example: 1642776702
	Timestamp int `json:"timestamp"`
}

// Contains info about validator commission settings
// swagger:model ValidatorCommission
type ValidatorCommission struct {
	// required: true
	// example: 0.050000000000000000
	Rate string `json:"rate"`
	// required: true
	// example: 0.200000000000000000
	MaxRate string `json:"maxRate"`
	// required: true
	// example: 0.010000000000000000
	MaxChangeRate string `json:"maxChangeRate"`
}

// Contains a list of validators
// swagger:model Validators
type Validators struct {
	// required: true
	Validators []Validator `json:"validators"`
}

// Contains info about a validator
// swagger:model Validator
type Validator struct {
	// required: true
	Address string `json:"address"`
	// required: true
	// example: SuperVal
	Moniker string `json:"moniker"`
	// required: true
	// example: false
	Jailed bool `json:"jailed"`
	// required: true
	// example: BOND_STATUS_BONDED
	Status string `json:"status"`
	// required: true
	// example: 12345
	Tokens string `json:"tokens"`
	// required: true
	// example: 12345.6789
	Shares string `json:"shares"`
	// required: true
	// example: http://superval.com
	Website string `json:"website"`
	// required: true
	// example: Your most super validator around!
	Description string `json:"description"`
	// required: true
	// example: 0.1541068456
	APR string `json:"apr"`
	// required: true
	Unbonding ValidatorUnbonding `json:"unbonding"`
	// required: true
	Commission ValidatorCommission `json:"commission"`
}

// Contains info about an asset value
// swagger:model Value
type Value struct {
	// required: true
	// example: 123456789
	Amount string `json:"amount"`
	// required: true
	// example: udenom
	Denom string `json:"denom"`
}
