package binance

import (
	"net/url"

	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/tendermint/go-amino"
	"github.com/tendermint/tendermint/types"
)

var logger = log.WithoutFields()

type Config struct {
	cosmos.Config
	BCURL string
}

type HTTPClient struct {
	*cosmos.HTTPClient
	bc *resty.Client
}

func NewHTTPClient(conf Config) (*HTTPClient, error) {
	httpClient, err := cosmos.NewHTTPClient(conf.Config)
	if err != nil {
		return nil, errors.Wrap(err, "failed to create new cosmos http client")
	}

	bcURL, err := url.Parse(conf.BCURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse BCURL: %s", conf.BCURL)
	}

	bc := resty.New().SetBaseURL(bcURL.String())

	c := &HTTPClient{
		HTTPClient: httpClient,
		bc:         bc,
	}

	return c, nil
}

func RegisterEventDatas(cdc *amino.Codec) {
	cdc.RegisterInterface((*types.TMEventData)(nil), nil)
	cdc.RegisterConcrete(EventDataNewBlockHeader{}, "tendermint/event/NewBlockHeader", nil)
	cdc.RegisterConcrete(types.EventDataTx{}, "tendermint/event/Tx", nil)
}
