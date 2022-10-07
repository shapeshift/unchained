package api

import (
	"github.com/shapeshift/unchained/coinstacks/thorchain"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

type ResultTx struct {
	Height     int64
	Index      int
	TxID       string
	Event      cosmos.AttributesByEvent
	TypedEvent thorchain.TypedEvent
	formatTx   func(tx *ResultTx) (*cosmos.Tx, error)
}

func (r *ResultTx) GetHeight() int64 {
	return r.Height
}

func (r *ResultTx) GetIndex() int {
	return r.Index
}

func (r *ResultTx) GetTxID() string {
	return r.TxID
}

func (r *ResultTx) FormatTx() (*cosmos.Tx, error) {
	return r.formatTx(r)
}
