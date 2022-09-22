package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/shapeshift/unchained/coinstacks/binance"
	"github.com/shapeshift/unchained/coinstacks/binance/api"
	"github.com/shapeshift/unchained/internal/config"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/cosmos"

	commontypes "gitlab.com/thorchain/binance-sdk/common/types"
	txtypes "gitlab.com/thorchain/binance-sdk/types/tx"
)

var (
	logger = log.WithoutFields()

	envPath     = flag.String("env", "", "path to env file (default: use os env)")
	swaggerPath = flag.String("swagger", "coinstacks/binance/api/swagger.json", "path to swagger spec")
)

// Config for running application
type Config struct {
	BCURL  string `mapstructure:"BC_URL"`
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
		if err := config.LoadFromEnv(conf, "BC_URL", "LCD_URL", "RPC_URL", "WS_URL"); err != nil {
			logger.Panicf("failed to load config from env: %+v", err)
		}
	} else {
		if err := config.Load(*envPath, conf); err != nil {
			logger.Panicf("failed to load config: %+v", err)
		}
	}

	encoding := cosmos.NewEncoding(commontypes.RegisterWire, txtypes.RegisterCodec, binance.RegisterEventDatas)

	cfg := binance.Config{
		Config: cosmos.Config{
			Bech32AddrPrefix:  "bnb",
			Bech32PkPrefix:    "bnbp",
			Bech32ValPrefix:   "bva",
			Bech32PkValPrefix: "bvap",
			Encoding:          encoding,
			LCDURL:            conf.LCDURL,
			RPCURL:            conf.RPCURL,
			WSURL:             conf.WSURL,
		},
		BCURL: conf.BCURL,
	}

	httpClient, err := binance.NewHTTPClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	blockService, err := cosmos.NewBlockService(httpClient)
	if err != nil {
		logger.Panicf("failed to create new block service: %+v", err)
	}

	wsClient, err := binance.NewWebsocketClient(cfg, blockService, errChan)
	if err != nil {
		logger.Panicf("failed to create new websocket client: %+v", err)
	}

	api := api.New(httpClient, wsClient, blockService, *swaggerPath)
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
