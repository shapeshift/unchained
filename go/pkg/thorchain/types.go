package thorchain

import (
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/tendermint/tendermint/types"
	tmtypes "github.com/tendermint/tendermint/types"
)

type Block interface {
	Hash() string
	Height() int64
	Timestamp() int64
}

type ResultBlock struct {
	*tmtypes.Block
}

func (b *ResultBlock) Hash() string {
	return b.Block.Hash().String()
}

func (b *ResultBlock) Height() int64 {
	return b.Block.Height
}

func (b *ResultBlock) Timestamp() int64 {
	return b.Block.Time.UnixMilli()
}

type NewBlockHeader struct {
	types.EventDataNewBlockHeader
}

func (b *NewBlockHeader) Hash() string {
	return b.Header.Hash().String()
}

func (b *NewBlockHeader) Height() int64 {
	return b.Header.Height
}

func (b *NewBlockHeader) Timestamp() int64 {
	return b.Header.Time.UnixMilli()
}

// ResultTx represents a tx_search ResultTx created from block_result block events
type ResultTx struct {
	BlockHash   string
	BlockHeight int64
	Timestamp   int
	Index       int
	TxID        string
	Memo        string
	Fee         cosmos.Value
	Events      cosmos.EventsByMsgIndex
	Messages    []cosmos.Message
	TypedEvent  TypedEvent
	FormatTxFn  func(tx *ResultTx) (*cosmos.Tx, error)
}

func (r *ResultTx) GetHeight() int64 {
	return r.BlockHeight
}

func (r *ResultTx) GetIndex() int {
	return r.Index
}

func (r *ResultTx) GetTxID() string {
	return r.TxID
}

func (r *ResultTx) FormatTx() (*cosmos.Tx, error) {
	return r.FormatTxFn(r)
}
