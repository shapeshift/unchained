package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/shapeshift/unchained/coinstacks/cosmos/api"
	"github.com/shapeshift/unchained/internal/config"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/metrics"
)

var (
	logger = log.WithoutFields()

	envPath     = flag.String("env", "", "path to env file (default: use os env)")
	swaggerPath = flag.String("swagger", "coinstacks/cosmos/api/swagger.json", "path to swagger spec")
)

// Config for running application
type Config struct {
	APIKEY  string `mapstructure:"API_KEY"`
	GRPCURL string `mapstructure:"GRPC_URL"`
	LCDURL  string `mapstructure:"LCD_URL"`
	RPCURL  string `mapstructure:"RPC_URL"`
	WSURL   string `mapstructure:"WS_URL"`
}

func main() {
	flag.Parse()

	errChan := make(chan error, 1)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)

	conf := &Config{}
	if *envPath == "" {
		if err := config.LoadFromEnv(conf, "API_KEY", "GRPC_URL", "LCD_URL", "RPC_URL", "WS_URL"); err != nil {
			logger.Panicf("failed to load config from env: %+v", err)
		}
	} else {
		if err := config.Load(*envPath, conf); err != nil {
			logger.Panicf("failed to load config: %+v", err)
		}
	}

	encoding := cosmos.NewEncoding()

	cfg := cosmos.Config{
		Bech32AddrPrefix:  "cosmos",
		Bech32PkPrefix:    "cosmospub",
		Bech32ValPrefix:   "cosmosvaloper",
		Bech32PkValPrefix: "cosmosvalpub",
		Encoding:          encoding,
		APIKEY:            conf.APIKEY,
		GRPCURL:           conf.GRPCURL,
		LCDURL:            conf.LCDURL,
		RPCURL:            conf.RPCURL,
		WSURL:             conf.WSURL,
	}

	prometheus := metrics.NewPrometheus("cosmos")

	httpClient, err := cosmos.NewHTTPClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	grpcClient, err := cosmos.NewGRPCClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new grpc client: %+v", err)
	}

	blockService, err := cosmos.NewBlockService(httpClient)
	if err != nil {
		logger.Panicf("failed to create new block service: %+v", err)
	}

	wsClient, err := cosmos.NewWebsocketClient(cfg, blockService, errChan)
	if err != nil {
		logger.Panicf("failed to create new websocket client: %+v", err)
	}

	api := api.New(httpClient, grpcClient, wsClient, blockService, *swaggerPath, prometheus)
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
