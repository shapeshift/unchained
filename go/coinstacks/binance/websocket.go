package binance

import (
	"context"
	"net"
	"net/url"

	"github.com/pkg/errors"
	"github.com/shapeshift/bnb-chain-go-sdk/client/rpc"
	commontypes "github.com/shapeshift/bnb-chain-go-sdk/common/types"
	"github.com/shapeshift/unchained/pkg/cosmos"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	"github.com/tendermint/tendermint/types"
)

func NewWebsocketClient(conf Config, blockService *cosmos.BlockService, errChan chan<- error) (*cosmos.WSClient, error) {
	wsURL, err := url.Parse(conf.WSURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse WSURL: %s", conf.WSURL)
	}

	client := rpc.NewWSClient(wsURL.String(), "/websocket")

	// use default dialer
	client.Dialer = net.Dial

	// custom amino unmarshaler to decode and convert to correct types
	unmarshal := func(bz []byte, result *coretypes.ResultEvent) error {
		err := conf.Encoding.Amino.UnmarshalJSON(bz, result)
		if err != nil {
			return err
		}

		switch v := result.Data.(type) {
		case commontypes.EventDataNewBlockHeader:
			result.Data = &cosmos.BlockResponse{
				Height:    int(v.Header.Height),
				Hash:      v.Header.Hash().String(),
				Timestamp: int(v.Header.Time.Unix()),
			}
		}

		return nil
	}

	ws := cosmos.NewBaseWebsocketClient(blockService, client, conf.Encoding, unmarshal, &client.ResponsesCh, errChan)

	rpc.MaxReconnectAttempts(10)(client)
	rpc.OnReconnect(func() {
		logger.Info("OnReconnect triggered: resubscribing")
		_ = client.Subscribe(context.Background(), types.EventQueryTx.String())
		_ = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
	})(client)

	return ws, nil
}
