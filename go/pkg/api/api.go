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

// Contains info about pagination metadata
// swagger:model Pagination
type Pagination struct {
	// Base64 encoded string to fetch next page or undefined if no more data avaiable
	// required: true
	// example: d2l0aGRyYXdfZGVsZWdhdG9yX3Jld2FyZA==
	Cursor string `json:"cursor,omitempty"`
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

// Contains info about required base transaction history details
// swagger:model BaseTxHistory
type BaseTxHistory struct {
	// swagger:allOf
	Pagination
	// required: true
	Pubkey string `json:"pubkey"`
	// required: true
	Txs []Tx `json:"txs"`
}

func (b BaseTxHistory) pubkey() string {
	return b.Pubkey
}

func (b BaseTxHistory) txs() []Tx {
	return b.Txs
}

// swagger:parameters GetEstimateGas
type TxBody struct {
	// Raw transaction
	// required: true
	RawTx string `json:"rawTx"`
}

// swagger:parameters GetAccount
type PubkeyParam struct {
	// Account address or xpub
	// in: path
	// required: true
	Pubkey string `json:"pubkey"`
}

// swagger:parameters GetTxHistory
type PaginatedPubkeyParam struct {
	PubkeyParam
	// Pagination cursor from previous response or empty string for first page fetch
	// in: query
	Cursor string `json:"cursor"`
	// Page size (default 10)
	// in: query
	PageSize int `json:"pageSize"`
}

// swagger:parameters SendTx
type TxParam struct {
	// in:body
	Body struct {
		TxBody
	}
}

// swagger:model TransactionHash
type TransactionHash string

// swagger:model GasAmount
type GasAmount string

// BaseAPI interface for all coinstacks to implement
type BaseAPI interface {
	GetInfo() (Info, error)
	GetAccount(pubkey string) (Account, error)
	GetTxHistory(pubkey string, cursor string, pageSize int) (TxHistory, error)
	SendTx(hex string) (string, error)
	EstimateGas(hex string) (string, error)
}
