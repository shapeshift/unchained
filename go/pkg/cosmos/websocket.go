package cosmos

import (
	"context"
	"fmt"
	"net"

	"github.com/cosmos/cosmos-sdk/simapp/params"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/pkg/websocket"
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
	path := fmt.Sprintf("/apikey/%s/websocket", conf.APIKey)
	url := fmt.Sprintf("wss://%s", conf.RPCURL)

	blockClient, err := tendermint.NewWS(url, path)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to create websocket client")
	}

	txsClient, err := tendermint.NewWS(url, path)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to create websocket client")
	}

	// use default dialer
	blockClient.Dialer = net.Dial
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
				fmt.Printf("%T", result.Data)

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
