package cosmos

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net"
	"net/url"
	"sync"
	"time"

	"cosmossdk.io/simapp/params"
	cometbftjson "github.com/cometbft/cometbft/libs/json"
	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	cometbft "github.com/cometbft/cometbft/rpc/jsonrpc/client"
	"github.com/cometbft/cometbft/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/websocket"
)

const (
	writeWait    = 15 * time.Second
	readWait     = 15 * time.Second
	pingPeriod   = (readWait * 9) / 10
	resetTimeout = 30 * time.Second
)

type TxHandlerFunc = func(tx types.EventDataTx, block *BlockResponse) (interface{}, []string, error)
type BlockEventHandlerFunc = func(eventCache map[string]interface{}, blockHeader types.Header, blockEvents []ABCIEvent, eventIndex int) (interface{}, []string, error)
type NewBlockHandlerFunc = func(newBlock types.EventDataNewBlock, blockEvents []ABCIEvent)

type WSClient struct {
	*websocket.Registry
	blockService      *BlockService
	client            *cometbft.WSClient
	encoding          *params.EncodingConfig
	errChan           chan<- error
	m                 sync.RWMutex
	t                 *time.Timer
	txHandler         TxHandlerFunc
	blockEventHandler BlockEventHandlerFunc
	newBlockHandlers  []NewBlockHandlerFunc
	unhandledTxs      map[int][]types.EventDataTx
}

func NewWebsocketClient(conf Config, blockService *BlockService, errChan chan<- error) (*WSClient, error) {
	wsURL, err := url.Parse(conf.WSURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse WSURL: %s", conf.WSURL)
	}

	client, err := cometbft.NewWS(wsURL.String(), "/websocket")
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

	ws.NewBlockHandler(ws.handleNewBlock)

	cometbft.ReadWait(readWait)
	cometbft.WriteWait(writeWait)
	cometbft.PingPeriod(pingPeriod)
	cometbft.MaxReconnectAttempts(10)(client)
	cometbft.OnReconnect(func() {
		logger.Info("OnReconnect triggered: resubscribing")
		ws.unhandledTxs = make(map[int][]types.EventDataTx)
		_ = client.Subscribe(context.Background(), types.EventQueryTx.String())
		_ = client.Subscribe(context.Background(), types.EventQueryNewBlock.String())
	})(client)

	return ws, nil
}

func (ws *WSClient) Start() error {
	if err := ws.client.Start(); err != nil {
		return errors.Wrap(err, "failed to start websocket client")
	}

	if err := ws.subscribe(); err != nil {
		return errors.Wrap(err, "failed to subscribe")
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

func (ws *WSClient) BlockEventHandler(fn BlockEventHandlerFunc) {
	ws.blockEventHandler = fn
}

func (ws *WSClient) NewBlockHandler(fn NewBlockHandlerFunc) {
	ws.newBlockHandlers = append(ws.newBlockHandlers, fn)
}

func (ws *WSClient) EncodingConfig() params.EncodingConfig {
	return *ws.encoding
}

func (ws *WSClient) subscribe() error {
	if err := ws.client.Subscribe(context.Background(), types.EventQueryTx.String()); err != nil {
		return errors.Wrap(err, "failed to subscribe to txs")
	}

	if err := ws.client.Subscribe(context.Background(), types.EventQueryNewBlock.String()); err != nil {
		return errors.Wrap(err, "failed to subscribe to newBlocks")
	}

	ws.t = time.AfterFunc(resetTimeout, ws.reset)

	return nil
}

func (ws *WSClient) reset() {
	logger.Debugln("reset websocket")

	ws.t.Stop()

	if err := ws.client.UnsubscribeAll(context.Background()); err != nil {
		logger.Error(errors.Wrap(err, "failed to unsubscribe from all subscriptions"))
	}

	if err := ws.subscribe(); err != nil {
		logger.Error(errors.Wrap(err, "failed to reset websocket"))
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
		if err := cometbftjson.Unmarshal(r.Result, result); err != nil {
			logger.Errorf("failed to unmarshal result event: %v", err)
			continue
		}

		if result.Data != nil {
			switch result.Data.(type) {
			case types.EventDataTx:
				ws.t.Reset(resetTimeout)
				go ws.handleTx(result.Data.(types.EventDataTx))
			case types.EventDataNewBlock:
				ws.t.Reset(resetTimeout)
				newBlock := result.Data.(types.EventDataNewBlock)
				blockEvents := ConvertABCIEvents(newBlock.ResultFinalizeBlock.Events)
				for _, handleNewBlock := range ws.newBlockHandlers {
					go handleNewBlock(newBlock, blockEvents)
				}
			default:
				fmt.Printf("unsupported result type: %T", result.Data)
			}
		}
	}
}

func (ws *WSClient) handleTx(tx types.EventDataTx) {
	logger.Debugf("tx: %X", sha256.Sum256(tx.Tx))

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

func (ws *WSClient) handleNewBlock(newBlock types.EventDataNewBlock, blockEvents []ABCIEvent) {
	logger.Debugf("block: %d", newBlock.Block.Height)

	b := &BlockResponse{
		Height:    int(newBlock.Block.Height),
		Hash:      newBlock.Block.Hash().String(),
		Timestamp: int(newBlock.Block.Time.Unix()),
	}

	ws.blockService.WriteBlock(b, true)

	if ws.blockEventHandler != nil {
		go func(b types.EventDataNewBlock, blockEvents []ABCIEvent) {
			eventCache := make(map[string]interface{})

			for i := range blockEvents {
				data, addrs, err := ws.blockEventHandler(eventCache, b.Block.Header, blockEvents, i)
				if err != nil {
					logger.Error(err)
					return
				}

				if data != nil {
					ws.Publish(addrs, data)
				}
			}
		}(newBlock, blockEvents)
	}

	// process any unhandled transactions
	for _, tx := range ws.unhandledTxs[b.Height] {
		go ws.handleTx(tx)
	}

	delete(ws.unhandledTxs, b.Height)
}
