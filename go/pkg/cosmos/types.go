package cosmos

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	"github.com/shapeshift/go-unchained/pkg/tendermint/client"
)

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

type Balance struct {
	Amount string  `json:"amount"`
	Assets []Value `json:"assets"`
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
	From      string   `json:"from,omitempty"`
	To        string   `json:"to,omitempty"`
	// required: true
	// example: /cosmos.bank.v1beta1.MsgSend
	Type  string `json:"type"`
	Value Value  `json:"value,omitempty"`
}

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
}

type Tx struct {
	TendermintTx client.TxSearchResponseResultTxs
	CosmosTx     sdk.Tx
	SigningTx    signing.Tx
}

type TxHistory struct {
	TotalPages int
	Txs        []Tx
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
