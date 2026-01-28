package cosmos

import (
	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/shapeshift/unchained/shared/cosmossdk"
)

type ResultBlockResults struct {
	*coretypes.ResultBlockResults
}

func (r *ResultBlockResults) GetBlockEvents() []cosmossdk.ABCIEvent {
	return ConvertABCIEvents(r.FinalizeBlockEvents)
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
