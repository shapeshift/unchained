package cosmos

import (
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
)

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

type TxHistoryResponse struct {
	Cursor string
	Txs    []*coretypes.ResultTx
}
