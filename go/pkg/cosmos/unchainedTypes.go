package cosmos

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
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

type DecodedTx struct {
	TendermintTx TendermintTx
	CosmosTx     sdk.Tx
	SigningTx    signing.Tx
}

type TxHistoryResponse struct {
	Cursor string
	Txs    []*DecodedTx
}
