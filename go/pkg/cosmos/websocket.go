package cosmos

import (
	"context"
	"fmt"
	"net"
	"net/url"

	"github.com/cosmos/cosmos-sdk/simapp/params"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/websocket"
	"github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	tendermint "github.com/tendermint/tendermint/rpc/jsonrpc/client"
	"github.com/tendermint/tendermint/types"
)

type TxHandlerFunc = func(tx types.EventDataTx) ([]byte, []string, error)

type WSClient struct {
	*websocket.Registry
	txs       *tendermint.WSClient
	encoding  *params.EncodingConfig
	txHandler TxHandlerFunc
}

func NewWebsocketClient(conf Config) (*WSClient, error) {
	wsURL, err := url.Parse(conf.WSURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse WSURL: %s", conf.WSURL)
	}

	path := fmt.Sprintf("/apikey/%s/websocket", conf.APIKey)

	txsClient, err := tendermint.NewWS(wsURL.String(), path)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to create websocket client")
	}

	// use default dialer
	txsClient.Dialer = net.Dial

	ws := &WSClient{
		Registry: websocket.NewRegistry(),
		encoding: conf.Encoding,
		txs:      txsClient,
	}

	return ws, nil
}

func (ws *WSClient) Start() error {
	err := ws.txs.Start()
	if err != nil {
		return errors.Wrap(err, "failed to start txs websocket")
	}

	err = ws.txs.Subscribe(context.Background(), types.EventQueryTx.String())
	if err != nil {
		return errors.Wrap(err, "failed to subscribe to txs")
	}

	go ws.listenTxs()

	return nil
}

func (ws *WSClient) Stop() {
	if err := ws.txs.Stop(); err != nil {
		logger.Errorf("failed to stop txs client: %v", err)
	}
}

func (ws *WSClient) TxHandler(fn TxHandlerFunc) {
	ws.txHandler = fn
}

func (ws *WSClient) EncodingConfig() params.EncodingConfig {
	return *ws.encoding
}

func (ws *WSClient) listenTxs() {
	for r := range ws.txs.ResponsesCh {
		if r.Error != nil {
			logger.Error(r.Error.Error())
			continue
		}

		result := &coretypes.ResultEvent{}
		if err := json.Unmarshal(r.Result, result); err != nil {
			logger.Errorf("failed to unmarshal tx message: %v", err)
			continue
		}

		if result.Data != nil {
			switch result.Data.(type) {
			case types.EventDataTx:
				go ws.handleTx(result.Data.(types.EventDataTx))
			default:
				fmt.Printf("unsupported result type: %T", result.Data)
			}
		}
	}
}

func (ws *WSClient) handleTx(tx types.EventDataTx) {
	msg, addrs, err := ws.txHandler(tx)
	if err != nil {
		logger.Errorf("failed to handle tx: %v", err)
		return
	}

	ws.Publish(addrs, msg)
}
