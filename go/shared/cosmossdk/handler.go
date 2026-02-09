package cosmossdk

import (
	"math/big"

	ws "github.com/gorilla/websocket"
	"github.com/shapeshift/unchained/shared/api"
	"github.com/shapeshift/unchained/shared/websocket"
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

type Handler struct {
	HTTPClient   APIClient
	BlockService *BlockService
	Denom        string
	NativeFee    int
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
