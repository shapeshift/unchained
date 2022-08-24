package api

import (
	"crypto/sha256"
	"fmt"
	"math/big"
	"reflect"
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
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

type APRData interface {
	Float() *big.Float
	String() string
}

type CoinSpecificHandler interface {
	GetAPRData() (APRData, error)
	ParseMessages([]sdk.Msg) []cosmos.Message
}

type Handler struct {
	// coin specific handler functions
	GetAPRData    func() (APRData, error)
	ParseMessages func([]sdk.Msg) []cosmos.Message

	// common cosmossdk values
	HTTPClient   *cosmos.HTTPClient
	GRPCClient   *cosmos.GRPCClient
	WSClient     *cosmos.WSClient
	BlockService *cosmos.BlockService
	Denom        string
}

// ValidateCoinSpecific performs runtime validation of a handler to:
//   - ensure it fully implements the CoinSpecificHandler interface and any coin specific functions
//   - assign any CoinSpecificHandler functions to the appropriate struct fields
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
			Events:        cosmos.ParseEvents(tx.Result.Log),
			Fee:           cosmos.Fee(signingTx, txid, h.Denom),
			GasWanted:     strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:       strconv.Itoa(int(tx.Result.GasUsed)),
			Index:         int(tx.Index),
			Memo:          signingTx.GetMemo(),
			Messages:      h.ParseMessages(decodedTx.GetMsgs()),
		}

		addrs := cosmos.GetTxAddrs(t.Events, t.Messages)

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
	account := Account{}

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

	if err := g.Wait(); err != nil {
		return nil, err
	}

	staking, err := h.getStaking(pubkey)
	if err != nil {
		return nil, err
	}

	account.Staking = staking

	return account, nil
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
			Events:        cosmos.ParseEvents(t.TendermintTx.TxResult.Log),
			Fee:           cosmos.Fee(t.SigningTx, *t.TendermintTx.Hash, h.Denom),
			GasWanted:     t.TendermintTx.TxResult.GasWanted,
			GasUsed:       t.TendermintTx.TxResult.GasUsed,
			Index:         int(t.TendermintTx.GetIndex()),
			Memo:          t.SigningTx.GetMemo(),
			Messages:      h.ParseMessages(t.CosmosTx.GetMsgs()),
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

func (h *Handler) GetValidators() ([]cosmos.Validator, error) {
	aprData, err := h.GetAPRData()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get apr data")
	}

	return h.HTTPClient.GetValidators(aprData.Float())
}

func (h *Handler) GetValidator(address string) (*cosmos.Validator, error) {
	aprData, err := h.GetAPRData()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get apr data")
	}

	return h.HTTPClient.GetValidator(address, aprData.Float())
}

func (h *Handler) getStaking(pubkey string) (*Staking, error) {
	aprData, err := h.GetAPRData()
	if err != nil {
		return nil, errors.Wrap(err, "failed to get apr data")
	}

	staking := &Staking{}

	g := new(errgroup.Group)

	g.Go(func() error {
		delegations, err := h.HTTPClient.GetDelegations(pubkey, aprData.Float())
		if err != nil {
			return err
		}

		staking.Delegations = delegations
		return nil
	})

	g.Go(func() error {
		redelegations, err := h.HTTPClient.GetRedelegations(pubkey, aprData.Float())
		if err != nil {
			return err
		}

		staking.Redelegations = redelegations
		return nil
	})

	g.Go(func() error {
		unbondings, err := h.HTTPClient.GetUnbondings(pubkey, h.Denom, aprData.Float())
		if err != nil {
			return err
		}

		staking.Unbondings = unbondings
		return nil
	})

	g.Go(func() error {
		rewards, err := h.HTTPClient.GetRewards(pubkey, aprData.Float())
		if err != nil {
			return err
		}

		staking.Rewards = rewards
		return nil
	})

	err = g.Wait()

	return staking, err
}
