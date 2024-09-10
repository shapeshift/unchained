package api

import (
	"context"
	"fmt"
	"net"
	"net/url"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/cosmos"
	tendermintjson "github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	tendermint "github.com/tendermint/tendermint/rpc/jsonrpc/client"
	"github.com/tendermint/tendermint/types"
)

type WSClient struct {
	blockService *cosmos.BlockService
	client       *tendermint.WSClient
	errChan      chan<- error
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

	tendermint.MaxReconnectAttempts(10)(client)
	tendermint.OnReconnect(func() {
		logger.Info("OnReconnect triggered: resubscribing")
		_ = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
	})(client)

	return ws, nil
}

func (ws *WSClient) Start() error {
	err := ws.client.Start()
	if err != nil {
		return errors.Wrap(err, "failed to start websocket client")
	}

	err = ws.client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
	if err != nil {
		return errors.Wrap(err, "failed to subscribe to newBlocks")
	}

	go ws.listen()

	return nil
}

func (ws *WSClient) Stop() {
	if err := ws.client.Stop(); err != nil {
		logger.Errorf("failed to stop the websocket client: %v", err)
	}
}

func (ws *WSClient) listen() {
	for r := range ws.client.ResponsesCh {
		if r.Error != nil {
			// resubscribe if subscription is cancelled by the server for reason: client is not pulling messages fast enough
			// experimental rpc config available to help mitigate this issue: https://github.com/tendermint/tendermint/blob/main/config/config.go#L373
			if r.Error.Code == -32000 {
				err := ws.client.UnsubscribeAll(context.Background())
				if err != nil {
					logger.Error(errors.Wrap(err, "failed to unsubscribe from all subscriptions"))
				}

				err = ws.client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
				if err != nil {
					logger.Error(errors.Wrap(err, "failed to subscribe to newBlocks"))
				}

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
				go ws.handleNewBlockHeader(result.Data.(types.EventDataNewBlockHeader))
			default:
				fmt.Printf("unsupported result type: %T", result.Data)
			}
		}
	}

	// if reconnect fails, ResponsesCh is closed
	ws.errChan <- errors.New("websocket client connection closed by server")
}

func (ws *WSClient) handleNewBlockHeader(block types.EventDataNewBlockHeader) {
	b := &cosmos.BlockResponse{
		Height:    int(block.Header.Height),
		Hash:      block.Header.Hash().String(),
		Timestamp: int(block.Header.Time.Unix()),
	}

	ws.blockService.WriteBlock(b, true)
}
