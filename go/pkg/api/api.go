// Package api provides a common base set of api types and functionality for all coinstacks to use,
// along with useful middlewares for an http server.
package api

type Account interface {
	balance() string
	pubkey() string
}

type BaseAccount struct {
	Balance string `json:"balance"`
	Pubkey  string `json:"pubkey"`
}

func (b BaseAccount) balance() string {
	return b.Balance
}

func (b BaseAccount) pubkey() string {
	return b.Pubkey
}

type Error struct {
	Message string `json:"message"`
}

type Info interface {
	network() string
}

//Contains required base info about the running coinstack
//swagger:model BaseInfo
type BaseInfo struct {
	// required: true
	// example: mainnet
	Network string `json:"network"`
}

func (b BaseInfo) network() string {
	return b.Network
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

//type TxHistory interface {
//	pubkey() string
//	txs() []Tx
//}

type TxHistory struct {
	Pubkey string `json:"pubkey"`
	Txs    []Tx   `json:"txs"`
}

//func (b BaseTxHistory) pubkey() string {
//	return b.Pubkey
//}
//
//func (b BaseTxHistory) txs() []Tx {
//	return b.Txs
//}

// BaseAPI interface for all coinstacks to implement
type BaseAPI interface {
	GetInfo() (Info, error)
	GetAccount(pubkey string) (Account, error)
	GetTxHistory(pubkey string) (TxHistory, error)
}
