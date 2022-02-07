package tendermint

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/internal/log"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
	tendermint "github.com/tendermint/tendermint/rpc/client/http"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
)

var logger = log.WithoutFields()

type WebsocketClient struct {
	txs      *tendermint.HTTP
	txsRes   <-chan coretypes.ResultEvent
	block    *tendermint.HTTP
	blockRes <-chan coretypes.ResultEvent
	registry map[string]chan<- []byte
}

func NewWebsocketClient(cfg cosmos.Config) (*WebsocketClient, error) {
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	path := fmt.Sprintf("/apikey/%s/websocket", cfg.APIKey)
	url := fmt.Sprintf("wss://%s", cfg.RPCURL)

	blockClient, err := tendermint.NewWithClient(url, path, client)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to create websocket client")
	}

	txsClient, err := tendermint.NewWithClient(url, path, client)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to create websocket client")
	}

	ws := &WebsocketClient{
		txs:   txsClient,
		block: blockClient,
	}

	return ws, nil
}

func (ws *WebsocketClient) Start() error {
	err := ws.block.OnStart()
	if err != nil {
		return errors.Wrap(err, "failed to start the block client")
	}

	err = ws.txs.OnStart()
	if err != nil {
		return errors.Wrap(err, "failed to start the txs client")
	}

	blockRes, err := ws.block.Subscribe(context.Background(), "", "tm.event = 'NewBlock'")
	if err != nil {
		return errors.Wrap(err, "failed to subscribe to NewBlock event")
	}
	ws.blockRes = blockRes

	txsRes, err := ws.txs.Subscribe(context.Background(), "", "tm.event = 'Tx'")
	if err != nil {
		return errors.Wrap(err, "failed to subscribe to Tx event")
	}

	ws.txsRes = txsRes

	go ws.listen()

	return nil
}

func (ws *WebsocketClient) Subscribe(addrs []string, msg chan<- []byte) {
	for _, a := range addrs {
		ws.registry[a] = msg
	}
}

func (ws *WebsocketClient) Unsubscribe(addrs []string) {
	for _, a := range addrs {
		delete(ws.registry, a)
	}
}

func (ws *WebsocketClient) Stop() {
	ws.txs.OnStop()
	ws.block.OnStop()
}

func (ws *WebsocketClient) listen() {
	for {
		select {
		case r := <-ws.blockRes:
			fmt.Printf("%+v\n", r)
		case r := <-ws.txsRes:
			fmt.Printf("%+v\n", r)
		default:
			fmt.Println("here")
		}
	}
}
