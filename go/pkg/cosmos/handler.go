package cosmos

import (
	"crypto/sha256"
	"fmt"
	"math/big"
	"reflect"
	"strconv"

	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	"github.com/cometbft/cometbft/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	ws "github.com/gorilla/websocket"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/websocket"
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
	GetTx(txid string) (api.Tx, error)
	SendTx(hex string) (string, error)
	EstimateGas(rawTx string) (string, error)
}

type CoinSpecificHandler interface {
	ParseMessages([]sdk.Msg, EventsByMsgIndex) []Message
	ParseFee(tx signing.Tx, txid string, denom string) Value
}

type Handler struct {
	// coin specific handler methods
	ParseMessages func([]sdk.Msg, EventsByMsgIndex) []Message
	ParseFee      func(tx signing.Tx, txid string, denom string) Value

	// common cosmossdk values
	HTTPClient   *HTTPClient
	GRPCClient   *GRPCClient
	WSClient     *WSClient
	BlockService *BlockService
	Denom        string
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
	h.WSClient.TxHandler(func(tx types.EventDataTx, block *BlockResponse) (interface{}, []string, error) {
		decodedTx, signingTx, err := DecodeTx(h.WSClient.EncodingConfig(), tx.Tx)
		if err != nil {
			return nil, nil, errors.Wrapf(err, "failed to handle tx: %v", tx.Tx)
		}

		txid := fmt.Sprintf("%X", sha256.Sum256(tx.Tx))
		events := ParseEvents(tx.Result)

		t := Tx{
			BaseTx: api.BaseTx{
				TxID:        txid,
				BlockHash:   &block.Hash,
				BlockHeight: block.Height,
				Timestamp:   block.Timestamp,
			},
			Confirmations: 1,
			Events:        events,
			Fee:           h.ParseFee(signingTx, txid, h.Denom),
			GasWanted:     strconv.Itoa(int(tx.Result.GasWanted)),
			GasUsed:       strconv.Itoa(int(tx.Result.GasUsed)),
			Index:         int(tx.Index),
			Memo:          signingTx.GetMemo(),
			Messages:      h.ParseMessages(decodedTx.GetMsgs(), events),
		}

		addrs := GetTxAddrs(t.Events, t.Messages)

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

	return account, nil
}

func (h *Handler) GetTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	sources := TxHistorySources(h.HTTPClient, pubkey, h.FormatTx)

	res, err := h.HTTPClient.GetTxHistory(pubkey, cursor, pageSize, sources)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history")
	}

	txHistory := TxHistory{
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

func (h *Handler) GetValidatorTxHistory(pubkey string, cursor string, pageSize int) (api.TxHistory, error) {
	sources := ValidatorTxHistorySources(h.HTTPClient, pubkey, h.FormatTx)

	res, err := h.HTTPClient.GetTxHistory(pubkey, cursor, pageSize, sources)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history")
	}

	txHistory := TxHistory{
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

func (h *Handler) SendTx(hex string) (string, error) {
	return h.HTTPClient.BroadcastTx(hex)
}

func (h Handler) EstimateGas(rawTx string) (string, error) {
	return h.HTTPClient.GetEstimateGas(rawTx)
}

func (h *Handler) GetStaking(pubkey string, apr *big.Float) (*Staking, error) {
	staking := &Staking{}

	g := new(errgroup.Group)

	g.Go(func() error {
		delegations, err := h.HTTPClient.GetDelegations(pubkey, apr)
		if err != nil {
			return err
		}

		staking.Delegations = delegations
		return nil
	})

	g.Go(func() error {
		redelegations, err := h.HTTPClient.GetRedelegations(pubkey, apr)
		if err != nil {
			return err
		}

		staking.Redelegations = redelegations
		return nil
	})

	g.Go(func() error {
		unbondings, err := h.HTTPClient.GetUnbondings(pubkey, h.Denom, apr)
		if err != nil {
			return err
		}

		staking.Unbondings = unbondings
		return nil
	})

	g.Go(func() error {
		rewards, err := h.HTTPClient.GetRewards(pubkey, apr)
		if err != nil {
			return err
		}

		staking.Rewards = rewards
		return nil
	})

	if err := g.Wait(); err != nil {
		return nil, err
	}

	return staking, nil
}

func (h *Handler) FormatTx(tx *coretypes.ResultTx) (*Tx, error) {
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

	t := &Tx{
		BaseTx: api.BaseTx{
			TxID:        tx.Hash.String(),
			BlockHash:   &block.Hash,
			BlockHeight: block.Height,
			Timestamp:   block.Timestamp,
		},
		Confirmations: h.BlockService.Latest.Height - height + 1,
		Events:        events,
		Fee:           h.ParseFee(signingTx, tx.Hash.String(), h.Denom),
		GasWanted:     strconv.Itoa(int(tx.TxResult.GasWanted)),
		GasUsed:       strconv.Itoa(int(tx.TxResult.GasUsed)),
		Index:         int(tx.Index),
		Memo:          signingTx.GetMemo(),
		Messages:      h.ParseMessages(cosmosTx.GetMsgs(), events),
	}

	return t, nil
}
