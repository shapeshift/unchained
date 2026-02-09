package thorchain

import (
	"crypto/sha256"
	"fmt"
	"reflect"
	"strconv"

	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	"github.com/cometbft/cometbft/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	ws "github.com/gorilla/websocket"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/shared/api"
	"github.com/shapeshift/unchained/shared/cosmossdk"
	"github.com/shapeshift/unchained/shared/websocket"
)

type CoinSpecificHandler interface {
	ParseMessages([]sdk.Msg, cosmossdk.EventsByMsgIndex) []cosmossdk.Message
	ParseFee(tx SigningTx, txid string) cosmossdk.Value
}

type Handler struct {
	*cosmossdk.Handler

	HTTPClient APIClient
	WSClient   *WSClient

	ParseMessages func([]sdk.Msg, cosmossdk.EventsByMsgIndex) []cosmossdk.Message
	ParseFee      func(tx SigningTx, txid string) cosmossdk.Value
}

// ValidateCoinSpecific performs runtime validation of a handler to ensure it fully implements
// the CoinSpecificHandler interface and assigns the functions to the appropriate struct method fields
func (h *Handler) ValidateCoinSpecific(handler interface{}) error {
	hV := reflect.ValueOf(h).Elem()
	handlerV := reflect.ValueOf(handler)
	handlerT := reflect.TypeOf(handler)
	coinSpecificT := reflect.TypeOf((*CoinSpecificHandler)(nil)).Elem()

	// check and assign coin specific handler functions
	for i := 0; i < coinSpecificT.NumMethod(); i++ {
		methodName := coinSpecificT.Method(i).Name

		if _, ok := handlerT.MethodByName(methodName); !ok {
			return errors.Errorf("Handler does not implement CoinSpecificHandler (missing method %s)", methodName)
		}

		hV.FieldByName(methodName).Set(handlerV.MethodByName(methodName))
	}

	return nil
}

func (h *Handler) NewWebsocketConnection(conn *ws.Conn, manager *websocket.Manager) {
	c := websocket.NewConnection(conn, h.WSClient, manager)
	c.Start()
}

func (h *Handler) StartWebsocket() error {
	h.WSClient.BlockEventHandler(func(eventCache map[string]interface{}, blockHeader types.Header, blockEvents []cosmossdk.ABCIEvent, eventIndex int) (interface{}, []string, error) {
		tx, err := GetTxFromBlockEvents(eventCache, blockHeader, blockEvents, eventIndex, h.BlockService.Latest.Height, h.Denom, h.NativeFee)
		if err != nil {
			return nil, nil, errors.Wrap(err, "failed to get txs from end block events")
		}

		if tx == nil {
			return nil, nil, nil
		}

		t, err := tx.FormatTx()
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to format transaction: %s", tx.TxID)
		}

		addrs := cosmossdk.GetTxAddrs(tx.Events, tx.Messages)

		return t, addrs, nil
	})

	h.WSClient.TxHandler(func(tx types.EventDataTx, block *cosmossdk.BlockResponse) (interface{}, []string, error) {
		decodedTx, signingTx, err := DecodeTx(h.WSClient.EncodingConfig(), tx.Tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to handle tx: %v", tx.Tx)
		}

		txid := fmt.Sprintf("%X", sha256.Sum256(tx.Tx))
		events := ParseEvents(tx.Result)

		t := cosmossdk.Tx{
			BaseTx: api.BaseTx{
				TxID:        txid,
				BlockHash:   &block.Hash,
				BlockHeight: block.Height,
				Timestamp:   block.Timestamp,
			},
			Confirmations: 1,
			Events:        events,
			Fee:           h.ParseFee(signingTx, txid),
			GasWanted:     strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:       strconv.Itoa(int(tx.Result.GasUsed)),
			Index:         int(tx.Index),
			Memo:          signingTx.GetMemo(),
			Messages:      h.ParseMessages(decodedTx.GetMsgs(), events),
		}

		addrs := cosmossdk.GetTxAddrs(t.Events, t.Messages)

		return t, addrs, nil
	})

	err := h.WSClient.Start()
	if err != nil {
		return errors.WithStack(err)
	}

	return nil
}

func (h *Handler) StopWebsocket() {
	h.WSClient.Stop()
}

func (h *Handler) GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	sources := TxHistorySources(h.HTTPClient, pubkey, h.FormatTx)

	res, err := h.HTTPClient.GetTxHistory(pubkey, cursor, pageSize, sources)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history")
	}

	txHistory := cosmossdk.TxHistory{
		BaseTxHistory: api.BaseTxHistory{
			Pagination: api.Pagination{
				Cursor: res.Cursor,
			},
			Pubkey: pubkey,
		},
		Txs: res.Txs,
	}

	return txHistory, nil
}

func (h *Handler) GetTx(txid string) (api.Tx, error) {
	tx, err := h.HTTPClient.GetTx(txid)
	if err != nil {
		return nil, err
	}

	t, err := h.FormatTx(tx)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to format transaction: %s", tx.Hash)
	}

	return t, nil
}

func (h *Handler) FormatTx(tx *coretypes.ResultTx) (*cosmossdk.Tx, error) {
	height := int(tx.Height)

	block, err := h.BlockService.GetBlock(height)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %d", height)
	}

	cosmosTx, signingTx, err := DecodeTx(*h.HTTPClient.GetEncoding(), tx.Tx)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to decode tx: %s", tx.Hash.String())
	}

	events := ParseEvents(tx.TxResult)

	t := &cosmossdk.Tx{
		BaseTx: api.BaseTx{
			TxID:        tx.Hash.String(),
			BlockHash:   &block.Hash,
			BlockHeight: block.Height,
			Timestamp:   block.Timestamp,
		},
		Confirmations: h.BlockService.Latest.Height - height + 1,
		Events:        events,
		Fee:           h.ParseFee(signingTx, tx.Hash.String()),
		GasWanted:     strconv.Itoa(int(tx.TxResult.GasWanted)),
		GasUsed:       strconv.Itoa(int(tx.TxResult.GasUsed)),
		Index:         int(tx.Index),
		Memo:          signingTx.GetMemo(),
		Messages:      h.ParseMessages(cosmosTx.GetMsgs(), events),
	}

	return t, nil
}
