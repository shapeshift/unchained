// Package api provides a common base set of api types and functionality for all coinstacks to use,
// along with useful middlewares for an http server.
package api

// Account details of an account
type Account struct {
	Balance string `json:"balance"`
	Pubkey  string `json:"pubkey"`
}

// Error response message
type Error struct {
	Message string `json:"message"`
}

// Info about a coinstack
type Info struct {
	Network string `json:"network"`
}

// Tx details for a transaction
type Tx struct {
	TxID        string  `json:"txid"`
	BlockHash   *string `json:"blockHash,omitempty"`
	BlockHeight *string `json:"blockHeight,omitempty"`
	Timestamp   *string `json:"timestamp,omitempty"`
}

// TxHistory for an account
type TxHistory struct {
	Pubkey string `json:"pubkey"`
	Txs    []Tx   `json:"txs"`
}

// BaseAPI interface for all coinstacks to implement
type BaseAPI interface {
	GetInfo() (Info, error)
	GetAccount(pubkey string) (Account, error)
	GetTxHistory(pubkey string) (TxHistory, error)
}
