package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/shapeshift/unchained/coinstacks/thorchain/api"
	"github.com/shapeshift/unchained/internal/config"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/metrics"

	thortypes "gitlab.com/thorchain/thornode/x/thorchain/types"
)

var (
	logger = log.WithoutFields()

	envPath     = flag.String("env", "", "path to env file (default: use os env)")
	swaggerPath = flag.String("swagger", "coinstacks/thorchain/api/swagger.json", "path to swagger spec")
)

type Config struct {
	LCDURL string `mapstructure:"LCD_URL"`
	RPCURL string `mapstructure:"RPC_URL"`
	WSURL  string `mapstructure:"WS_URL"`
}

func main() {
	flag.Parse()

	errChan := make(chan error, 1)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)

	conf := &Config{}
	if *envPath == "" {
		if err := config.LoadFromEnv(conf, "LCD_URL", "RPC_URL", "WS_URL"); err != nil {
			logger.Panicf("failed to load config from env: %+v", err)
		}
	} else {
		if err := config.Load(*envPath, conf); err != nil {
			logger.Panicf("failed to load config: %+v", err)
		}
	}

	encoding := cosmos.NewEncoding(thortypes.RegisterInterfaces)

	cfg := cosmos.Config{
		Bech32AddrPrefix:  "thor",
		Bech32PkPrefix:    "thorpub",
		Bech32ValPrefix:   "thorv",
		Bech32PkValPrefix: "thorvpub",
		Encoding:          encoding,
		LCDURL:            conf.LCDURL,
		RPCURL:            conf.RPCURL,
		WSURL:             conf.WSURL,
	}

	prometheus := metrics.NewPrometheus("thorchain")

	httpClient, err := cosmos.NewHTTPClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	blockService, err := cosmos.NewBlockService(httpClient)
	if err != nil {
		logger.Panicf("failed to create new block service: %+v", err)
	}

	wsClient, err := cosmos.NewWebsocketClient(cfg, blockService, errChan)
	if err != nil {
		logger.Panicf("failed to create new websocket client: %+v", err)
	}

	api := api.New(httpClient, wsClient, blockService, *swaggerPath, prometheus)
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
