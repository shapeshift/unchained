package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	gammtypes "github.com/osmosis-labs/osmosis/v6/x/gamm/types"
	lockuptypes "github.com/osmosis-labs/osmosis/v6/x/lockup/types"
	"github.com/shapeshift/go-unchained/coinstacks/osmosis/api"
	"github.com/shapeshift/go-unchained/internal/config"
	"github.com/shapeshift/go-unchained/internal/log"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
)

var (
	logger = log.WithoutFields()

	confPath    = flag.String("config", "cmd/osmosis/config.json", "path to configuration file")
	swaggerPath = flag.String("swagger", "/app/coinstacks/osmosis/api/swagger.json", "path to swagger spec")
)

// Config for running application
type Config struct {
	APIKey string `mapstructure:"apiKey"`
	LCDURL string `mapstructure:"lcdUrl"`
	RPCURL string `mapstructure:"rpcUrl"`
}

func main() {
	flag.Parse()

	errChan := make(chan error, 1)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)

	conf := &Config{}
	if err := config.Load(*confPath, conf); err != nil {
		logger.Panicf("failed to load config: %+v", err)
	}

	encoding := cosmos.NewEncoding(
		gammtypes.RegisterInterfaces,
		lockuptypes.RegisterInterfaces,
	)

	cfg := cosmos.Config{
		APIKey:           conf.APIKey,
		Bech32AddrPrefix: "osmo",
		Bech32PkPrefix:   "osmopub",
		Encoding:         encoding,
		LCDURL:           conf.LCDURL,
		RPCURL:           conf.RPCURL,
	}

	httpClient, err := cosmos.NewHTTPClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	wsClient, err := cosmos.NewWebsocketClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new websocket client: %+v", err)
	}

	api := api.New(httpClient, wsClient, *swaggerPath)
	defer api.Shutdown()

	go api.Serve(errChan)

	select {
	case err := <-errChan:
		logger.Panicf("%+v", err)
	case <-sigChan:
		api.Shutdown()
		os.Exit(0)
	}
}
