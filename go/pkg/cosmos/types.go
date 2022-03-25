package cosmos

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
)

// Account info common return payload
type Account struct {
	Address       string
	AccountNumber int
	Sequence      int
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

// Balance info common return payload
type Balance struct {
	Amount string  `json:"amount"`
	Assets []Value `json:"assets"`
}

// Block info common return payload
type Block struct {
	Height    int
	Hash      string
	Timestamp int
}

// Contains info about a staking delegation
// swagger:model Delegation
type Delegation struct {
	// required: true
	Validator string `json:"validator"`
	// required: true
	// example: 123456.789
	Shares string `json:"shares"`
	// required: true
	// example: 123456789
	Balance Value `json:"balance"`
}

// ErrorResponse payload for an api request
type ErrorResponse struct {
	Code   int           `json:"code"`
	Msg    string        `json:"message"`
	Detail []interface{} `json:"detail"`
}

// Contains info about tx events keyed by message index
// swagger:model EventsByMsgIndex
type EventsByMsgIndex map[string][]Event

// Contains info about a transaction log event
// swagger:model Event
type Event struct {
	// required: true
	// example: message
	Type string `json:"type"`
	// required: true
	Attributes []Attribute `json:"attributes"`
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

// Pagination info cosmos-sdk response
type Pagination struct {
	NextKey *[]byte `json:"next_key,omitempty"`
	Total   uint64  `json:"total,string,omitempty"`
}

// Contains info about a staking redelegation
// swagger:model Redelegation
type Redelegation struct {
	// required: true
	SourceValidator string `json:"sourceValidator"`
	// required: true
	DestinationValidator string `json:"destinationValidator"`
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

// Tx info common return payload
type Tx struct {
	TendermintTx TxSearchResponseResultTxs
	CosmosTx     sdk.Tx
	SigningTx    signing.Tx
}

// TxHistory info common return payload
type TxHistory struct {
	Cursor string
	Txs    []Tx
}

// Contains info about a staking unbonding
// swagger:model Unbonding
type Unbonding struct {
	// required: true
	Validator string `json:"validator"`
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
