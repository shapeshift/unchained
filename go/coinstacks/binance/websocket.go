package binance

import (
	"context"
	"net"
	"net/url"
	"strconv"
	"time"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/cosmos"
	tmrand "github.com/tendermint/tendermint/libs/rand"
	tmsync "github.com/tendermint/tendermint/libs/sync"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	rpctypes "github.com/tendermint/tendermint/rpc/jsonrpc/types"
	"github.com/tendermint/tendermint/types"
	"gitlab.com/thorchain/binance-sdk/client/rpc"
)

// WSClient wraps the binance-sdk WSClient to properly implement the WebsocketHandler interface.
// This also allows us to add missing reconnect logic.
type WSClient struct {
	*rpc.WSClient
	maxReconnectAttempts int
	mtx                  tmsync.RWMutex
	nextReqID            int
	onReconnect          func()
	reconnecting         bool
}

func NewWebsocketClient(conf Config, blockService *cosmos.BlockService, errChan chan<- error) (*cosmos.WSClient, error) {
	wsURL, err := url.Parse(conf.WSURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse WSURL: %s", conf.WSURL)
	}

	responsesCh := make(chan rpctypes.RPCResponse)

	client := &WSClient{
		WSClient: rpc.NewWSClient(wsURL.String(), "/websocket", responsesCh),
	}

	// use default dialer
	client.Dialer = net.Dial

	// custom amino unmarshaler to decode and convert to correct types
	unmarshal := func(bz []byte, result *coretypes.ResultEvent) error {
		err := conf.Encoding.Amino.UnmarshalJSON(bz, result)
		if err != nil {
			return err
		}

		switch v := result.Data.(type) {
		case EventDataNewBlockHeader:
			result.Data = v.ToEventDataNewBlockHeader()
		}

		return nil
	}

	ws := cosmos.NewBaseWebsocketClient(blockService, client, conf.Encoding, unmarshal, responsesCh, errChan)

	MaxReconnectAttempts(10)(client)
	OnReconnect(func() {
		logger.Info("OnReconnect triggered: resubscribing")
		_ = client.Subscribe(context.Background(), types.EventQueryTx.String())
		_ = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
	})(client)

	return ws, nil
}

func MaxReconnectAttempts(max int) func(*WSClient) {
	return func(c *WSClient) {
		c.maxReconnectAttempts = max
	}
}

func OnReconnect(cb func()) func(*WSClient) {
	return func(c *WSClient) {
		c.onReconnect = cb
	}
}

func (c *WSClient) Start() error {
	err := c.WSClient.Start()
	if err != nil {
		return err
	}

	go c.reconnectRoutine()

	return nil
}

func (c *WSClient) Subscribe(ctx context.Context, query string) error {
	return c.WSClient.Subscribe(ctx, c.nextRequestID(), query)
}

func (c *WSClient) UnsubscribeAll(ctx context.Context) error {
	return c.WSClient.UnsubscribeAll(ctx, c.nextRequestID())
}

func (c *WSClient) nextRequestID() rpctypes.JSONRPCStringID {
	c.mtx.Lock()
	id := c.nextReqID
	c.nextReqID++
	c.mtx.Unlock()
	return rpctypes.JSONRPCStringID(strconv.Itoa(id))
}

func (c *WSClient) reconnectRoutine() {
	for range c.Quit() {
		if err := c.reconnect(); err != nil {
			logger.Errorf("failed to reconnect: %v", err)
			if err := c.Stop(); err != nil {
				logger.Errorf("failed to stop: %v", err)
			}
			return
		}
	}
}

func (c *WSClient) reconnect() error {
	attempt := 0

	c.mtx.Lock()
	c.reconnecting = true
	c.mtx.Unlock()

	defer func() {
		c.mtx.Lock()
		c.reconnecting = false
		c.mtx.Unlock()
	}()

	for {
		jitter := time.Duration(tmrand.Float64() * float64(time.Second))
		backoffDuration := jitter + ((1 << uint(attempt)) * time.Second)

		logger.Infof("reconnect attempt %d", attempt+1)
		time.Sleep(backoffDuration)

		err := c.Start()
		if err != nil {
			logger.Errorf("failed to reconnect: %v", err)
		} else {
			logger.Info("reconnected")
			if c.onReconnect != nil {
				go c.onReconnect()
			}
			return nil
		}

		attempt++

		if attempt > c.maxReconnectAttempts {
			return errors.Wrap(err, "reached maximum reconnect attempts")
		}
	}
}
