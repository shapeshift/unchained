package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/shapeshift/unchained/coinstacks/mayachain/api"
	"github.com/shapeshift/unchained/pkg/mayachain/cosmos"
	"github.com/shapeshift/unchained/shared/config"
	"github.com/shapeshift/unchained/shared/log"
	"github.com/shapeshift/unchained/shared/metrics"

	mayatypes "gitlab.com/mayachain/mayanode/x/mayachain/types"
)

var (
	logger = log.WithoutFields()

	envPath     = flag.String("env", "", "path to env file (default: use os env)")
	swaggerPath = flag.String("swagger", "coinstacks/mayachain/api/swagger.json", "path to swagger spec")
)

type Config struct {
	LCDURL        string `mapstructure:"LCD_URL"`
	LCDAPIKEY     string `mapstructure:"LCD_API_KEY"`
	RPCURL        string `mapstructure:"RPC_URL"`
	RPCAPIKEY     string `mapstructure:"RPC_API_KEY"`
	INDEXERURL    string `mapstructure:"INDEXER_URL"`
	INDEXERAPIKEY string `mapstructure:"INDEXER_API_KEY"`
	WSURL         string `mapstructure:"WS_URL"`
	WSAPIKEY      string `mapstructure:"WS_API_KEY"`
}

func main() {
	flag.Parse()

	errChan := make(chan error, 1)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)

	conf := &Config{}
	if *envPath == "" {
		if err := config.LoadFromEnv(conf, "LCD_URL", "LCD_API_KEY", "RPC_URL", "RPC_API_KEY", "INDEXER_URL", "INDEXER_API_KEY", "WS_URL", "WS_API_KEY"); err != nil {
			logger.Panicf("failed to load config from env: %+v", err)
		}
	} else {
		if err := config.Load(*envPath, conf); err != nil {
			logger.Panicf("failed to load config: %+v", err)
		}
	}

	encoding := cosmos.NewEncoding(mayatypes.RegisterInterfaces)

	cfg := api.Config{
		Config: cosmos.Config{
			Bech32AddrPrefix:  "maya",
			Bech32PkPrefix:    "mayapub",
			Bech32ValPrefix:   "mayav",
			Bech32PkValPrefix: "mayavpub",
			Denom:             "cacao",
			NativeFee:         2000000000, // https://daemon.mayachain.shapeshift.com/lcd/mayachain/constants
			Encoding:          encoding,
			LCDAPIKEY:         conf.LCDAPIKEY,
			LCDURL:            conf.LCDURL,
			RPCAPIKEY:         conf.RPCAPIKEY,
			RPCURL:            conf.RPCURL,
			WSURL:             conf.WSURL,
			WSAPIKEY:          conf.WSAPIKEY,
		},
		INDEXERURL:    conf.INDEXERURL,
		INDEXERAPIKEY: conf.INDEXERAPIKEY,
	}

	prometheus := metrics.NewPrometheus("mayachain")

	httpClient, err := api.NewHTTPClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	blockService, err := cosmos.NewBlockService(httpClient)
	if err != nil {
		logger.Panicf("failed to create new block service: %+v", err)
	}

	wsClient, err := cosmos.NewWebsocketClient(cfg.Config, blockService, errChan)
	if err != nil {
		logger.Panicf("failed to create new websocket client: %+v", err)
	}

	indexer := api.NewAffiliateFeeIndexer(httpClient.HTTPClient, wsClient)
	if err := indexer.Sync(); err != nil {
		logger.Panicf("failed to index affiliate fees: %+v", err)
	}

	api := api.New(cfg.Config, httpClient, wsClient, blockService, indexer, *swaggerPath, prometheus)
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
