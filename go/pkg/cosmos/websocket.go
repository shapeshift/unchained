package cosmos

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"sync"

	"github.com/cosmos/cosmos-sdk/simapp/params"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/websocket"
	abci "github.com/tendermint/tendermint/abci/types"
	tendermintjson "github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	tendermint "github.com/tendermint/tendermint/rpc/jsonrpc/client"
	"github.com/tendermint/tendermint/types"
)

type TxHandlerFunc = func(tx types.EventDataTx, block *BlockResponse) (interface{}, []string, error)
type EndBlockEventHandlerFunc = func(eventCache map[string]interface{}, blockHeader types.Header, endBlockEvents []abci.Event, eventIndex int) (interface{}, []string, error)

type WSClient struct {
	*websocket.Registry
	blockService         *BlockService
	client               *tendermint.WSClient
	encoding             *params.EncodingConfig
	errChan              chan<- error
	m                    sync.RWMutex
	txHandler            TxHandlerFunc
	endBlockEventHandler EndBlockEventHandlerFunc
	unhandledTxs         map[int][]types.EventDataTx
}

func NewWebsocketClient(conf Config, blockService *BlockService, errChan chan<- error) (*WSClient, error) {
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
		Registry:     websocket.NewRegistry(),
		blockService: blockService,
		client:       client,
		encoding:     conf.Encoding,
		errChan:      errChan,
		unhandledTxs: make(map[int][]types.EventDataTx),
	}

	tendermint.MaxReconnectAttempts(10)(client)
	tendermint.OnReconnect(func() {
		logger.Info("OnReconnect triggered: resubscribing")
		ws.unhandledTxs = make(map[int][]types.EventDataTx)
		_ = client.Subscribe(context.Background(), types.EventQueryTx.String())
		_ = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
	})(client)

	return ws, nil
}

func (ws *WSClient) Start() error {
	err := ws.client.Start()
	if err != nil {
		return errors.Wrap(err, "failed to start websocket client")
	}

	err = ws.client.Subscribe(context.Background(), types.EventQueryTx.String())
	if err != nil {
		return errors.Wrap(err, "failed to subscribe to txs")
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

func (ws *WSClient) TxHandler(fn TxHandlerFunc) {
	ws.txHandler = fn
}

func (ws *WSClient) EndBlockEventHandler(fn EndBlockEventHandlerFunc) {
	ws.endBlockEventHandler = fn
}

func (ws *WSClient) EncodingConfig() params.EncodingConfig {
	return *ws.encoding
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

				err = ws.client.Subscribe(context.Background(), types.EventQueryTx.String())
				if err != nil {
					logger.Error(errors.Wrap(err, "failed to subscribe to txs"))
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
			case types.EventDataTx:
				go ws.handleTx(result.Data.(types.EventDataTx))
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

func (ws *WSClient) handleTx(tx types.EventDataTx) {
	// queue up any transactions detected before block details are available
	block, ok := ws.blockService.Blocks[int(tx.Height)]
	if !ok {
		ws.m.Lock()
		ws.unhandledTxs[int(tx.Height)] = append(ws.unhandledTxs[int(tx.Height)], tx)
		ws.m.Unlock()
		return
	}

	if ws.txHandler != nil {
		data, addrs, err := ws.txHandler(tx, block)
		if err != nil {
			logger.Error(err)
			return
		}

		ws.Publish(addrs, data)
	}
}

func (ws *WSClient) handleNewBlockHeader(block types.EventDataNewBlockHeader) {
	b := &BlockResponse{
		Height:    int(block.Header.Height),
		Hash:      block.Header.Hash().String(),
		Timestamp: int(block.Header.Time.Unix()),
	}

	ws.blockService.WriteBlock(b, true)

	if ws.endBlockEventHandler != nil {
		go func(b types.EventDataNewBlockHeader) {
			eventCache := make(map[string]interface{})

			for i := range b.ResultEndBlock.Events {
				data, addrs, err := ws.endBlockEventHandler(eventCache, b.Header, b.ResultEndBlock.Events, i)
				if err != nil {
					logger.Error(err)
					return
				}

				if data != nil {
					ws.Publish(addrs, data)
				}
			}
		}(block)
	}

	// process any unhandled transactions
	for _, tx := range ws.unhandledTxs[b.Height] {
		go ws.handleTx(tx)
	}
	delete(ws.unhandledTxs, b.Height)
}
