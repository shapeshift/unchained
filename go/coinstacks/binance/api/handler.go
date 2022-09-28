package api

import (
	"crypto/sha256"
	"fmt"
	"strconv"

	ws "github.com/gorilla/websocket"
	"github.com/pkg/errors"
	"github.com/shapeshift/bnb-chain-go-sdk/client/rpc"
	commontypes "github.com/shapeshift/bnb-chain-go-sdk/common/types"
	txtypes "github.com/shapeshift/bnb-chain-go-sdk/types/tx"
	"github.com/shapeshift/unchained/coinstacks/binance"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/websocket"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	"github.com/tendermint/tendermint/types"
)

type Handler struct {
	HTTPClient   *binance.HTTPClient
	WSClient     *cosmos.WSClient
	BlockService *cosmos.BlockService
}

func (h *Handler) NewWebsocketConnection(conn *ws.Conn, manager *websocket.Manager) {
	c := websocket.NewConnection(conn, h.WSClient, manager)
	c.Start()
}

func (h *Handler) StartWebsocket() error {
	h.WSClient.TxHandler(func(tx types.EventDataTx, block *cosmos.BlockResponse) (interface{}, []string, error) {
		pTx, err := rpc.ParseTx(h.HTTPClient.GetEncoding().Amino.Amino, tx.Tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to handle tx: %v, in block: %v", tx.Tx, block.Height)
		}

		txid := fmt.Sprintf("%X", sha256.Sum256(tx.Tx))

		fmt.Println("tx received:", txid)

		t := Tx{
			BaseTx: api.BaseTx{
				TxID:        txid,
				BlockHash:   &block.Hash,
				BlockHeight: block.Height,
				Timestamp:   block.Timestamp,
			},
			Confirmations: h.BlockService.Latest.Height - int(tx.Height) + 1,
			GasUsed:       strconv.Itoa(int(tx.Result.GasUsed)),
			GasWanted:     strconv.Itoa(int(tx.Result.GasWanted)),
			Index:         int(tx.Index),
			Memo:          pTx.(txtypes.StdTx).Memo,
			Messages:      binance.ParseMessages(pTx.GetMsgs()),
		}

		seen := make(map[string]bool)
		addrs := []string{}

		for _, m := range t.Messages {
			if m.Addresses == nil {
				continue
			}

			// unique set of addresses
			for _, addr := range m.Addresses {
				if _, ok := seen[addr]; !ok {
					addrs = append(addrs, addr)
					seen[addr] = true
				}
			}
		}

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

func (h *Handler) GetInfo() (api.Info, error) {
	info := Info{
		Info: api.BaseInfo{
			Network: "mainnet",
		},
	}

	return info, nil
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	res := commontypes.BalanceAccount{}

	_, err := h.HTTPClient.LCD.R().SetResult(&res).Get(fmt.Sprintf("/api/v1/account/%s", pubkey))
	if err != nil {
		return nil, errors.Wrap(err, "failed to get account")
	}

	balances := map[string]string{"BNB": "0"}
	for _, b := range res.Balances {
		balances[b.Symbol] = strconv.Itoa(int(b.Free.ToInt64()))
	}

	a := Account{
		BaseAccount: api.BaseAccount{
			Balance:            balances["BNB"],
			UnconfirmedBalance: "0",
			Pubkey:             res.Address,
		},
		AccountNumber: int(res.Number),
		Sequence:      int(res.Sequence),
		Assets:        []cosmos.Value{},
	}

	return a, nil
}

func (h *Handler) GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	res, err := h.HTTPClient.GetTxHistory(pubkey, cursor, pageSize)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history")
	}

	txs := []Tx{}
	for _, t := range res.Txs {
		tx, err := h.formatTx(t)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to format transaction: %s", t.Hash)
		}

		txs = append(txs, *tx)
	}

	txHistory := TxHistory{
		BaseTxHistory: api.BaseTxHistory{
			Pagination: api.Pagination{
				Cursor: res.Cursor,
			},
			Pubkey: pubkey,
		},
		Txs: txs,
	}

	return txHistory, nil
}

func (h *Handler) GetTx(txid string) (api.Tx, error) {
	tx, err := h.HTTPClient.GetTx(txid)
	if err != nil {
		return nil, err
	}

	t, err := h.formatTx(tx)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to format transaction: %s", tx.Hash.String())
	}

	return t, nil
}

func (h *Handler) SendTx(hex string) (string, error) {
	return h.HTTPClient.BroadcastTx(hex)
}

func (h Handler) EstimateGas(rawTx string) (string, error) {
	// no gas required for binance chain transactions
	return "0", nil
}

func (h *Handler) formatTx(tx *coretypes.ResultTx) (*Tx, error) {
	pTx, err := rpc.ParseTx(h.HTTPClient.GetEncoding().Amino.Amino, tx.Tx)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse tx: %v", tx.Tx)
	}

	block, err := h.BlockService.GetBlock(int(tx.Height))
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %d", tx.Height)
	}

	t := &Tx{
		BaseTx: api.BaseTx{
			TxID:        tx.Hash.String(),
			BlockHash:   &block.Hash,
			BlockHeight: block.Height,
			Timestamp:   block.Timestamp,
		},
		// TODO: reference fees from /api/v1/fees
		Fee:           cosmos.Value{Amount: "0", Denom: "BNB"},
		Confirmations: h.BlockService.Latest.Height - int(tx.Height) + 1,
		GasUsed:       strconv.Itoa(int(tx.TxResult.GasUsed)),
		GasWanted:     strconv.Itoa(int(tx.TxResult.GasWanted)),
		Index:         int(tx.Index),
		Memo:          pTx.(txtypes.StdTx).Memo,
		Messages:      binance.ParseMessages(pTx.GetMsgs()),
	}

	return t, nil
}
