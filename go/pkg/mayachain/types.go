package mayachain

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/shared/cosmossdk"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
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
	return b.Time.UnixMilli()
}

type NewBlock struct {
	tenderminttypes.EventDataNewBlock
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
type BlockResultTx struct {
	BlockHash    string
	BlockHeight  int64
	Timestamp    int
	Index        int
	TxID         string
	Memo         string
	Fee          cosmossdk.Value
	Events       cosmossdk.EventsByMsgIndex
	Messages     []cosmossdk.Message
	TypedEvent   TypedEvent
	latestHeight int
	formatTx     func(tx *BlockResultTx) (*cosmossdk.Tx, error)
}

func (r *BlockResultTx) GetHeight() int64 {
	return r.BlockHeight
}

func (r *BlockResultTx) GetIndex() int {
	return r.Index
}

func (r *BlockResultTx) GetTxID() string {
	return r.TxID
}

func (r *BlockResultTx) FormatTx() (*cosmossdk.Tx, error) {
	return r.formatTx(r)
}

type ResultBlockResults struct {
	*coretypes.ResultBlockResults
}

func (r *ResultBlockResults) GetBlockEvents() []cosmossdk.ABCIEvent {
	return ConvertABCIEvents(r.EndBlockEvents)
}

type ResultTx struct {
	*coretypes.ResultTx
	formatTx func(tx *coretypes.ResultTx) (*cosmossdk.Tx, error)
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

func (r *ResultTx) FormatTx() (*cosmossdk.Tx, error) {
	return r.formatTx(r.ResultTx)
}

type SigningTx interface {
	GetMemo() string
	GetFee() sdk.Coins
}

type signingTx struct {
	memo string
	fee  sdk.Coins
}

func (t *signingTx) GetMemo() string {
	return t.memo
}

func (t *signingTx) GetFee() sdk.Coins {
	return t.fee
}
