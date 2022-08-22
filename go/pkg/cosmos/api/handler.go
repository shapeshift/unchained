package api

import (
	"crypto/sha256"
	"fmt"
	"strconv"

	ws "github.com/gorilla/websocket"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/websocket"
	"github.com/tendermint/tendermint/types"
	"golang.org/x/sync/errgroup"
)

type RouteHandler interface {
	// WS
	StartWebsocket() error
	StopWebsocket()
	NewWebsocketConnection(conn *ws.Conn, manager *websocket.Manager)

	// REST
	GetInfo() (api.Info, error)
	GetAccount(pubkey string) (api.Account, error)
	GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error)
	SendTx(hex string) (string, error)
	EstimateGas(rawTx string) (string, error)
}

type Handler struct {
	HTTPClient   *cosmos.HTTPClient
	GRPCClient   *cosmos.GRPCClient
	WSClient     *cosmos.WSClient
	BlockService *cosmos.BlockService
	Denom        string
}

func (h *Handler) NewWebsocketConnection(conn *ws.Conn, manager *websocket.Manager) {
	c := websocket.NewConnection(conn, h.WSClient, manager)
	c.Start()
}

func (h *Handler) StartWebsocket() error {
	h.WSClient.TxHandler(func(tx types.EventDataTx, block *cosmos.Block) (interface{}, []string, error) {
		decodedTx, signingTx, err := cosmos.DecodeTx(h.WSClient.EncodingConfig(), tx.Tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to handle tx: %v", tx.Tx)
		}

		txid := fmt.Sprintf("%X", sha256.Sum256(tx.Tx))

		t := Tx{
			BaseTx: api.BaseTx{
				TxID:        txid,
				BlockHash:   &block.Hash,
				BlockHeight: &block.Height,
				Timestamp:   &block.Timestamp,
			},
			Confirmations: 1,
			Events:        cosmos.Events(tx.Result.Log),
			Fee:           cosmos.Fee(signingTx, txid, h.Denom),
			GasWanted:     strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:       strconv.Itoa(int(tx.Result.GasUsed)),
			Index:         int(tx.Index),
			Memo:          signingTx.GetMemo(),
			Messages:      cosmos.Messages(decodedTx.GetMsgs()),
		}

		seen := make(map[string]bool)
		addrs := []string{}

		// extract addresses from events
		for _, events := range t.Events {
			for _, event := range events {
				if !(event.Type == "coin_spent" || event.Type == "coin_received") {
					continue
				}

				for _, attribute := range event.Attributes {
					if !(attribute.Key == "spender" || attribute.Key == "receiver") {
						continue
					}

					addr := attribute.Value
					if _, ok := seen[addr]; !ok {
						addrs = append(addrs, addr)
						seen[addr] = true
					}
				}
			}
		}

		// extract addresses from messages
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
		BaseInfo: api.BaseInfo{
			Network: "mainnet",
		},
	}

	return info, nil
}

func (h *Handler) GetAccount(pubkey string) (api.Account, error) {
	account := Account{BaseAccount: api.BaseAccount{}}

	g := new(errgroup.Group)

	g.Go(func() error {
		a, err := h.HTTPClient.GetAccount(pubkey)
		if err != nil {
			return err
		}

		account.Pubkey = a.Address
		account.AccountNumber = int(a.AccountNumber)
		account.Sequence = int(a.Sequence)

		return nil
	})

	g.Go(func() error {
		b, err := h.HTTPClient.GetBalance(pubkey, h.Denom)
		if err != nil {
			return err
		}

		account.Balance = b.Amount
		account.UnconfirmedBalance = "0"
		account.Assets = b.Assets

		return err
	})

	err := g.Wait()

	return account, err
}

func (h *Handler) GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	res, err := h.HTTPClient.GetTxHistory(pubkey, cursor, pageSize)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history")
	}

	txs := []Tx{}
	for _, t := range res.Txs {
		height, err := strconv.Atoi(*t.TendermintTx.Height)
		if err != nil {
			return nil, errors.WithStack(err)
		}

		block, err := h.BlockService.GetBlock(height)
		if err != nil {
			return nil, errors.Wrap(err, "failed to get tx history")
		}

		tx := Tx{
			BaseTx: api.BaseTx{
				TxID:        *t.TendermintTx.Hash,
				BlockHash:   &block.Hash,
				BlockHeight: &block.Height,
				Timestamp:   &block.Timestamp,
			},
			Confirmations: h.BlockService.Latest.Height - height + 1,
			Events:        cosmos.Events(t.TendermintTx.TxResult.Log),
			Fee:           cosmos.Fee(t.SigningTx, *t.TendermintTx.Hash, h.Denom),
			GasWanted:     t.TendermintTx.TxResult.GasWanted,
			GasUsed:       t.TendermintTx.TxResult.GasUsed,
			Index:         int(t.TendermintTx.GetIndex()),
			Memo:          t.SigningTx.GetMemo(),
			Messages:      cosmos.Messages(t.CosmosTx.GetMsgs()),
		}

		txs = append(txs, tx)
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

func (h *Handler) SendTx(hex string) (string, error) {
	return h.HTTPClient.BroadcastTx(hex)
}

func (h Handler) EstimateGas(rawTx string) (string, error) {
	return h.HTTPClient.GetEstimateGas(rawTx)
}
