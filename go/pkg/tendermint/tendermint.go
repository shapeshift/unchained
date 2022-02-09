package tendermint

import (
	"context"
	"fmt"
	"net"
	"strconv"

	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/internal/log"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
	"github.com/shapeshift/go-unchained/pkg/websocket"
	"github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	tendermint "github.com/tendermint/tendermint/rpc/jsonrpc/client"
	"github.com/tendermint/tendermint/types"
)

var logger = log.WithoutFields()

type WebsocketClient struct {
	*websocket.Registry
	txs *tendermint.WSClient
}

func NewWebsocketClient(cfg cosmos.Config) (*WebsocketClient, error) {
	path := fmt.Sprintf("/apikey/%s/websocket", cfg.APIKey)
	url := fmt.Sprintf("wss://%s", cfg.RPCURL)

	txsClient, err := tendermint.NewWS(url, path)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to create websocket client")
	}

	// use default dialer
	txsClient.Dialer = net.Dial

	ws := &WebsocketClient{
		Registry: websocket.NewRegistry(),
		txs:      txsClient,
	}

	return ws, nil
}
func (ws *WebsocketClient) Start() error {
	err := ws.txs.Start()
	if err != nil {
		return errors.Wrap(err, "failed to start websocket")
	}

	err = ws.txs.Subscribe(context.Background(), types.EventQueryTx.String())
	if err != nil {
		return errors.Wrap(err, "failed to subscribe")
	}

	go ws.listen()

	return nil
}

func (ws *WebsocketClient) Stop() {
	if err := ws.txs.Stop(); err != nil {
		logger.Errorf("failed to stop txs client: %v", err)
	}
}

func (ws *WebsocketClient) listen() {
	for r := range ws.txs.ResponsesCh {
		if r.Error != nil {
			logger.Error(r.Error.Error())
			continue
		}

		result := &coretypes.ResultEvent{}
		if err := json.Unmarshal(r.Result, result); err != nil {
			logger.Errorf("failed to unmarshal message: %v", err)
			continue
		}

		if result.Data != nil {
			go ws.handleTx(result.Data.(types.EventDataTx))
		}
	}
}

func (ws *WebsocketClient) handleTx(tx types.EventDataTx) {
	ws.Publish([]string{"test"}, []byte(strconv.Itoa(int(tx.Height))))
}
