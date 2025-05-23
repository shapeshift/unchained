package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/cosmos/cosmos-sdk/x/auth/tx"
	"github.com/shapeshift/unchained/coinstacks/thorchain/api"
	"github.com/shapeshift/unchained/internal/config"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/metrics"

	"gitlab.com/thorchain/thornode/v3/x/thorchain/ebifrost"
	thortypes "gitlab.com/thorchain/thornode/v3/x/thorchain/types"
)

var (
	logger = log.WithoutFields()

	envPath     = flag.String("env", "", "path to env file (default: use os env)")
	swaggerPath = flag.String("swagger", "coinstacks/thorchain/api/swagger.json", "path to swagger spec")
)

type Config struct {
	LCDURL   string `mapstructure:"LCD_URL"`
	LCDV1URL string `mapstructure:"LCD_V1_URL"`
	RPCURL   string `mapstructure:"RPC_URL"`
	RPCV1URL string `mapstructure:"RPC_V1_URL"`
	WSURL    string `mapstructure:"WS_URL"`
}

func main() {
	flag.Parse()

	errChan := make(chan error, 1)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)

	conf := &Config{}
	if *envPath == "" {
		if err := config.LoadFromEnv(conf, "LCD_URL", "LCD_V1_URL", "RPC_URL", "RPC_V1_URL", "WS_URL"); err != nil {
			logger.Panicf("failed to load config from env: %+v", err)
		}
	} else {
		if err := config.Load(*envPath, conf); err != nil {
			logger.Panicf("failed to load config: %+v", err)
		}
	}

	encoding := cosmos.NewEncoding(thortypes.RegisterInterfaces)

	// custom tx config options to support thorchain inject txs
	opts := tx.ConfigOptions{
		EnabledSignModes: tx.DefaultSignModes,
		ProtoDecoder:     ebifrost.TxDecoder(encoding.Codec, encoding.TxConfig.TxDecoder()),
	}

	txconfig, err := tx.NewTxConfigWithOptions(encoding.Codec, opts)
	if err != nil {
		logger.Panicf("failed to create new tx config: %+v", err)
	}

	// overwrite standard tx config with the custom inject tx config
	encoding.TxConfig = txconfig

	cfg := cosmos.Config{
		Bech32AddrPrefix:  "thor",
		Bech32PkPrefix:    "thorpub",
		Bech32ValPrefix:   "thorv",
		Bech32PkValPrefix: "thorvpub",
		Denom:             "rune",
		NativeFee:         2000000, // https://daemon.thorchain.shapeshift.com/lcd/thorchain/constants
		Encoding:          encoding,
		LCDURL:            conf.LCDURL,
		RPCURL:            conf.RPCURL,
		WSURL:             conf.WSURL,
	}

	cfgV1 := cosmos.Config{
		Bech32AddrPrefix:  "thor",
		Bech32PkPrefix:    "thorpub",
		Bech32ValPrefix:   "thorv",
		Bech32PkValPrefix: "thorvpub",
		Denom:             "rune",
		NativeFee:         2000000, // https://daemon.thorchain.shapeshift.com/lcd/thorchain/constants
		Encoding:          encoding,
		LCDURL:            conf.LCDV1URL,
		RPCURL:            conf.RPCV1URL,
	}

	prometheus := metrics.NewPrometheus("thorchain")

	httpClient, err := cosmos.NewHTTPClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	httpClientV1, err := cosmos.NewHTTPClient(cfgV1)
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

	indexer := api.NewAffiliateFeeIndexer([]*cosmos.HTTPClient{httpClientV1, httpClient}, wsClient)
	if err := indexer.Sync(); err != nil {
		logger.Panicf("failed to index affiliate fees: %+v", err)
	}

	api := api.New(cfg, httpClient, wsClient, blockService, indexer, *swaggerPath, prometheus)
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
