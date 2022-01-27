// Package api provides a common base set of api types and functionality for all coinstacks to use,
// along with useful middlewares for an http server.
package api

// Generic api error for handling failed requests
// swagger:model ApiError
type Error struct {
	// required: true
	Message string `json:"message"`
}

// Contains info about a 400 Bad Request response
// swagger:model BadRequestError
type BadRequestError struct {
	// required: true
	Error string `json:"error"`
}

// Contains info about a 422 Validation Error response
// swagger:model ValidationError
type ValidationError struct {
	// required: true
	// example: Validation failed
	Message string `json:"message"`
	// required: true
	Details map[string]string `json:"details"`
}

// Contains info about a 500 Internal Server Error response
// swagger:model InternalServerError
type InternalServerError struct {
	Message string `json:"message"`
}

type Info interface {
	network() string
}

// Contains required base info about the running coinstack
// swagger:model BaseInfo
type BaseInfo struct {
	// required: true
	// example: mainnet
	Network string `json:"network"`
}

func (b BaseInfo) network() string {
	return b.Network
}

type Account interface {
	balance() string
	pubkey() string
}

// Contains info about required base account details for an address or xpub
// swagger:model BaseAccount
type BaseAccount struct {
	// required: true
	// example: 123456789
	Balance string `json:"balance"`
	// required: true
	// example: 0
	UnconfirmedBalance string `json:"unconfirmedBalance"`
	// required: true
	Pubkey string `json:"pubkey"`
}

func (b BaseAccount) balance() string {
	return b.Balance
}

func (b BaseAccount) pubkey() string {
	return b.Pubkey
}

// Contains info about pagination for large sets of data
// swagger:model Pagination
type Pagination struct {
	// required: true
	// example: 1
	Page int `json:"page"`
	// required: true
	// example: 10
	TotalPages int `json:"totalPages"`
}

type Tx interface {
	txid() string
	blockHash() *string
	blockHeight() *string
	timestamp() *string
}

// Contains info about required base transaction details
// swagger:model BaseTx
type BaseTx struct {
	// required: true
	TxID      string  `json:"txid"`
	BlockHash *string `json:"blockHash,omitempty"`
	// example: 1000000
	BlockHeight *string `json:"blockHeight,omitempty"`
	// example: 1643052655037
	Timestamp *string `json:"timestamp,omitempty"`
}

type TxHistory interface {
	pubkey() string
	txs() []Tx
}

type BaseTxHistory struct {
	// swagger:allOf
	Pagination
	// required: true
	Pubkey string `json:"pubkey"`
	Txs    []Tx   `json:"txs"`
}

func (b BaseTxHistory) pubkey() string {
	return b.Pubkey
}

func (b BaseTxHistory) txs() []Tx {
	return b.Txs
}

// swagger:parameters GetAccount
type PubkeyParam struct {
	// Account address or xpub
	// in: path
	// required: true
	Pubkey string `json:"pubkey"`
}

// swagger:parameters GetTxHistory
type TxHistoryParam struct {
	// Account address or xpub
	// in: path
	// required: true
	Pubkey string `json:"pubkey"`
	// Page number (default 1)
	// in: query
	Page int `json:"page"`
	// Page size (default 25)
	// in: query
	PageSize int `json:"pageSize"`
}

// BaseAPI interface for all coinstacks to implement
type BaseAPI interface {
	GetInfo() (Info, error)
	GetAccount(pubkey string) (Account, error)
	GetTxHistory(pubkey string, page int, pageSize int) (TxHistory, error)
}
