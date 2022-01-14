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
	// example: cosmos1rcuft35qpjzpezpg6ytcrf0nmvk3l96qxdpmph
	Pubkey string `json:"pubkey"`
}

func (b BaseAccount) balance() string {
	return b.Balance
}

func (b BaseAccount) pubkey() string {
	return b.Pubkey
}

type Tx interface {
	txid() string
	blockHash() *string
	blockHeight() *string
	timestamp() *string
}

type BaseTx struct {
	TxID        string  `json:"txid"`
	BlockHash   *string `json:"blockHash,omitempty"`
	BlockHeight *string `json:"blockHeight,omitempty"`
	Timestamp   *string `json:"timestamp,omitempty"`
}

type TxHistory interface {
	pubkey() string
	txs() []Tx
}

type BaseTxHistory struct {
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
	// Account address
	// in: path
	// required: true
	// example: cosmos1rcuft35qpjzpezpg6ytcrf0nmvk3l96qxdpmph
	Pubkey string `json:"pubkey"`
}

// BaseAPI interface for all coinstacks to implement
type BaseAPI interface {
	GetInfo() (Info, error)
	GetAccount(pubkey string) (Account, error)
	GetTxHistory(pubkey string) (TxHistory, error)
}
