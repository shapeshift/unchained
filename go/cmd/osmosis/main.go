package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	gammtypes "github.com/osmosis-labs/osmosis/v6/x/gamm/types"
	lockuptypes "github.com/osmosis-labs/osmosis/v6/x/lockup/types"
	"github.com/shapeshift/unchained/coinstacks/osmosis"
	"github.com/shapeshift/unchained/coinstacks/osmosis/api"
	"github.com/shapeshift/unchained/internal/config"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/cosmos"
)

var (
	logger = log.WithoutFields()

	envPath     = flag.String("env", "", "path to env file (default: use os env)")
	swaggerPath = flag.String("swagger", "coinstacks/osmosis/api/swagger.json", "path to swagger spec")
)

// Config for running application
type Config struct {
	APIKey   string `mapstructure:"API_KEY"`
	GRPCURL  string `mapstructure:"GRPC_URL"`
	LCDURL   string `mapstructure:"LCD_URL"`
	KEPLRURL string `mapstructure:"KEPLR_URL"`
	RPCURL   string `mapstructure:"RPC_URL"`
	WSURL    string `mapstructure:"WS_URL"`
}

func main() {
	flag.Parse()

	errChan := make(chan error, 1)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)

	conf := &Config{}
	if *envPath == "" {
		if err := config.LoadFromEnv(conf, "API_KEY", "GRPC_URL", "LCD_URL", "KEPLR_URL", "RPC_URL", "WS_URL"); err != nil {
			logger.Panicf("failed to load config from env: %+v", err)
		}
	} else {
		if err := config.Load(*envPath, conf); err != nil {
			logger.Panicf("failed to load config: %+v", err)
		}
	}

	encoding := cosmos.NewEncoding(gammtypes.RegisterInterfaces, lockuptypes.RegisterInterfaces)

	cfg := osmosis.Config{
		Config: cosmos.Config{
			APIKey:            conf.APIKey,
			Bech32AddrPrefix:  "osmo",
			Bech32PkPrefix:    "osmopub",
			Bech32ValPrefix:   "osmovaloper",
			Bech32PkValPrefix: "osmovalpub",
			Encoding:          encoding,
			GRPCURL:           conf.GRPCURL,
			LCDURL:            conf.LCDURL,
			RPCURL:            conf.RPCURL,
			WSURL:             conf.WSURL,
		},
		KEPLRURL: conf.KEPLRURL,
	}

	httpClient, err := osmosis.NewHTTPClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	grpcClient, err := cosmos.NewGRPCClient(cfg.Config)
	if err != nil {
		logger.Panicf("failed to create new grpc client: %+v", err)
	}

	blockService, err := cosmos.NewBlockService(httpClient)
	if err != nil {
		logger.Panicf("failed to create new block service: %+v", err)
	}

	wsClient, err := cosmos.NewWebsocketClient(cfg.Config, blockService, errChan)
	if err != nil {
		logger.Panicf("failed to create new websocket client: %+v", err)
	}

	api := api.New(httpClient, grpcClient, wsClient, blockService, *swaggerPath)
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
