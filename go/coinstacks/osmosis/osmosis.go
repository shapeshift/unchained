package osmosis

import (
	"net/url"

	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

type Config struct {
	cosmos.Config
	KEPLRURL string
}

type HTTPClient struct {
	*cosmos.HTTPClient
	keplr *resty.Client
}

func NewHTTPClient(conf Config) (*HTTPClient, error) {
	httpClient, err := cosmos.NewHTTPClient(conf.Config)
	if err != nil {
		return nil, errors.Wrap(err, "failed to create new cosmos http client")
	}

	keplrURL, err := url.Parse(conf.KEPLRURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse keplrURL: %s", conf.KEPLRURL)
	}

	keplr := resty.New().SetScheme(keplrURL.Scheme).SetBaseURL(keplrURL.Host)

	c := &HTTPClient{
		HTTPClient: httpClient,
		keplr:      keplr,
	}

	return c, nil
}
