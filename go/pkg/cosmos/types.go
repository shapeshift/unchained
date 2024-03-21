package cosmos

import coretypes "github.com/cometbft/cometbft/rpc/core/types"

type AccountResponse struct {
	Address       string
	AccountNumber int
	Sequence      int
}

type BalanceResponse struct {
	Amount string  `json:"amount"`
	Assets []Value `json:"assets"`
}

type BlockResponse struct {
	Height    int
	Hash      string
	Timestamp int
}

type ErrorResponse struct {
	Code   int           `json:"code"`
	Msg    string        `json:"message"`
	Detail []interface{} `json:"detail"`
}

type Pagination struct {
	NextKey *[]byte `json:"next_key,omitempty"`
	Total   uint64  `json:"total,string,omitempty"`
}

type HistoryTx interface {
	GetHeight() int64
	GetIndex() int
	GetTxID() string
	FormatTx() (*Tx, error)
}

type ResultTx struct {
	*coretypes.ResultTx
	formatTx func(tx *coretypes.ResultTx) (*Tx, error)
}

func (r *ResultTx) GetHeight() int64 {
	return r.Height
}

func (r *ResultTx) GetIndex() int {
	return int(r.Index)
}

func (r *ResultTx) GetTxID() string {
	return r.Hash.String()
}

func (r *ResultTx) FormatTx() (*Tx, error) {
	return r.formatTx(r.ResultTx)
}

type TxHistoryResponse struct {
	Cursor string
	Txs    []Tx
}

type ValidatorsResponse struct {
	Validators []Validator
	Pagination PageResponse
}
