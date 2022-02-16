package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/shapeshift/go-unchained/coinstacks/osmosis/api"
	"github.com/shapeshift/go-unchained/internal/config"
	"github.com/shapeshift/go-unchained/internal/log"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
	thortypes "gitlab.com/thorchain/thornode/x/thorchain/types"
)

var (
	logger = log.WithoutFields()

	confPath    = flag.String("config", "cmd/thorchain/config.json", "path to configuration file")
	swaggerPath = flag.String("swagger", "/app/coinstacks/thorchain/api/swagger.json", "path to swagger spec")
)

type Config struct {
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

	encoding := cosmos.NewEncoding(thortypes.RegisterInterfaces)

	cfg := cosmos.Config{
		Bech32AddrPrefix: "thor",
		Bech32PkPrefix:   "thorpub",
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
