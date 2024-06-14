package main

import (
	"flag"
	"fmt"
	"math/big"
	"os"
	"os/signal"
	"syscall"

	"github.com/shapeshift/unchained/cmd/thorchainAffiliateIndexer/indexer"
	"github.com/shapeshift/unchained/internal/config"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/cosmos"

	thortypes "gitlab.com/thorchain/thornode/x/thorchain/types"
)

const (
	workers          = 10
	pageSize         = 10
	affiliateAddress = "thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l"
)

var (
	logger  = log.WithoutFields()
	envPath = flag.String("env", "", "path to env file (default: use os env)")
	//swaggerPath = flag.String("swagger", "coinstacks/thorchain/api/swagger.json", "path to swagger spec")
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

	//prometheus := metrics.NewPrometheus("thorchainAffiliateIndexer")

	httpClient, err := cosmos.NewHTTPClient(cfg)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	indexer := indexer.NewIndexer(httpClient)

	go func() {
		indexer.Sync()

		total := new(big.Int)
		for _, fee := range indexer.AffiliateFees {
			amount := new(big.Int)
			amount.SetString(fee.Amount, 10)
			total = new(big.Int).Add(total, amount)
		}

		fmt.Println(len(indexer.AffiliateFees), total.String())
	}()

	select {
	case err := <-errChan:
		logger.Panicf("%+v", err)
	case <-sigChan:
		os.Exit(0)
	}
}
