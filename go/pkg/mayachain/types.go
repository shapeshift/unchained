package mayachain

import (
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/tendermint/tendermint/types"
	tenderminttypes "github.com/tendermint/tendermint/types"
)

type Block interface {
	Hash() string
	Height() int64
	Timestamp() int64
}

type ResultBlock struct {
	*tenderminttypes.Block
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

type NewBlock struct {
	types.EventDataNewBlock
}

func (b *NewBlock) Hash() string {
	return b.Block.Hash().String()
}

func (b *NewBlock) Height() int64 {
	return b.Block.Height
}

func (b *NewBlock) Timestamp() int64 {
	return b.Block.Time.UnixMilli()
}

// ResultTx represents a tx_search ResultTx created from block_result block events
type ResultTx struct {
	BlockHash    string
	BlockHeight  int64
	Timestamp    int
	Index        int
	TxID         string
	Memo         string
	Fee          cosmos.Value
	Events       cosmos.EventsByMsgIndex
	Messages     []cosmos.Message
	TypedEvent   TypedEvent
	latestHeight int
	formatTx     func(tx *ResultTx) (*cosmos.Tx, error)
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
	return r.formatTx(r)
}
