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

type TxSearchResponse struct {
	Jsonrpc string                 `json:"jsonrpc"`
	Id      int32                  `json:"id"`
	Result  TxSearchResponseResult `json:"result"`
}

type TxSearchResponseResult struct {
	Txs        []TxSearchResponseResultTxs `json:"txs"`
	TotalCount string                      `json:"total_count"`
}

type TxSearchResponseResultTxs struct {
	Hash     *string                         `json:"hash,omitempty"`
	Height   *string                         `json:"height,omitempty"`
	Index    *int32                          `json:"index,omitempty"`
	TxResult *TxSearchResponseResultTxResult `json:"tx_result,omitempty"`
	Tx       *string                         `json:"tx,omitempty"`
	Proof    *TxSearchResponseResultProof    `json:"proof,omitempty"`
}

// GetIndex returns the Index field value if set, zero value otherwise.
func (o *TxSearchResponseResultTxs) GetIndex() int32 {
	if o == nil || o.Index == nil {
		var ret int32
		return ret
	}
	return *o.Index
}

type TxSearchResponseResultTxResult struct {
	Log       string `json:"log"`
	GasWanted string `json:"gas_wanted"`
	GasUsed   string `json:"gas_used"`
	Tags      Event  `json:"tags"`
}

type TxSearchResponseResultProof struct {
	RootHash string                           `json:"RootHash"`
	Data     string                           `json:"Data"`
	Proof    TxSearchResponseResultProofProof `json:"Proof"`
}

type TxSearchResponseResultProofProof struct {
	Total    string   `json:"total"`
	Index    string   `json:"index"`
	LeafHash string   `json:"leaf_hash"`
	Aunts    []string `json:"aunts"`
}
