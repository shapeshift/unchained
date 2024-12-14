package api

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"time"

	tendermintjson "github.com/cometbft/cometbft/libs/json"
	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	tendermint "github.com/cometbft/cometbft/rpc/jsonrpc/client"
	"github.com/cometbft/cometbft/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

const (
	writeWait    = 15 * time.Second
	readWait     = 15 * time.Second
	pingPeriod   = (readWait * 9) / 10
	resetTimeout = 30 * time.Second
)

type WSClient struct {
	blockService *cosmos.BlockService
	client       *tendermint.WSClient
	errChan      chan<- error
	t            *time.Timer
}

func NewWebsocketClient(conf cosmos.Config, blockService *cosmos.BlockService, errChan chan<- error) (*WSClient, error) {
	wsURL, err := url.Parse(conf.WSURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse WSURL: %s", conf.WSURL)
	}

	client, err := tendermint.NewWS(wsURL.String(), "/websocket")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to create websocket client")
	}

	// use default dialer
	client.Dialer = net.Dial

	ws := &WSClient{
		blockService: blockService,
		client:       client,
		errChan:      errChan,
	}

	tendermint.ReadWait(readWait)
	tendermint.WriteWait(writeWait)
	tendermint.PingPeriod(pingPeriod)
	tendermint.MaxReconnectAttempts(10)(client)
	tendermint.OnReconnect(func() {
		logger.Info("OnReconnect triggered: resubscribing")
		_ = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
	})(client)

	return ws, nil
}

func (ws *WSClient) Start() error {
	if err := ws.client.Start(); err != nil {
		return errors.Wrap(err, "failed to start websocket client")
	}

	if err := ws.subscribe(); err != nil {
		return errors.Wrap(err, "failed to start websocket client")
	}

	go ws.listen()

	return nil
}

func (ws *WSClient) Stop() {
	if err := ws.client.Stop(); err != nil {
		logger.Errorf("failed to stop the websocket client: %v", err)
	}
}

func (ws *WSClient) subscribe() error {
	if err := ws.client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String()); err != nil {
		return errors.Wrap(err, "failed to subscribe to newBlocks")
	}

	ws.t = time.AfterFunc(resetTimeout, ws.reset)

	return nil
}

func (ws *WSClient) reset() {
	logger.Debugln("reset websocket")

	ws.t.Stop()

	if err := ws.client.UnsubscribeAll(context.Background()); err != nil {
		ws.errChan <- errors.Wrap(err, "failed to unsubscribe from all subscriptions")
	}

	if err := ws.subscribe(); err != nil {
		ws.errChan <- errors.Wrap(err, "failed to reset websocket")
	}
}

func (ws *WSClient) listen() {
	for r := range ws.client.ResponsesCh {
		if r.Error != nil {
			// resubscribe if subscription is cancelled by the server for reason: client is not pulling messages fast enough
			if r.Error.Code == -32000 {
				ws.reset()
				continue
			}

			logger.Error(r.Error.Error())
			continue
		}

		result := &coretypes.ResultEvent{}
		if err := tendermintjson.Unmarshal(r.Result, result); err != nil {
			logger.Errorf("failed to unmarshal tx message: %v", err)
			continue
		}

		if result.Data != nil {
			switch result.Data.(type) {
			case types.EventDataNewBlockHeader:
				ws.t.Reset(resetTimeout)
				go ws.handleNewBlockHeader(result.Data.(types.EventDataNewBlockHeader))
			default:
				fmt.Printf("unsupported result type: %T", result.Data)
			}
		}
	}
}

func (ws *WSClient) handleNewBlockHeader(block types.EventDataNewBlockHeader) {
	logger.Debugf("block: %d", block.Header.Height)

	b := &cosmos.BlockResponse{
		Height:    int(block.Header.Height),
		Hash:      block.Header.Hash().String(),
		Timestamp: int(block.Header.Time.Unix()),
	}

	ws.blockService.WriteBlock(b, true)
}
