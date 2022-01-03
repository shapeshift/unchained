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

var logger = log.WithoutFields()

var confPath = flag.String("config", "cmd/thorchain/config.json", "path to configuration file")

type Config struct {
	APIKey  string `mapstructure:"apiKey"`
	GRPCURL string `mapstructure:"grpcUrl"`
	LCDURL  string `mapstructure:"lcdUrl"`
	RPCURL  string `mapstructure:"rpcUrl"`
}

func main() {
	flag.Parse()

	errChan := make(chan error, 1)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)

	conf := &Config{}
	if err := config.Load(*confPath, conf); err != nil {
		logger.Panic(err)
	}

	encoding := cosmos.NewEncoding(thortypes.RegisterInterfaces)

	cfg := cosmos.Config{
		APIKey:           conf.APIKey,
		Bech32AddrPrefix: "thor",
		Bech32PkPrefix:   "thorpub",
		Encoding:         encoding,
		GRPCURL:          conf.GRPCURL,
		LCDURL:           conf.LCDURL,
		RPCURL:           conf.RPCURL,
	}

	httpClient, err := cosmos.NewHTTPClient(cfg)
	if err != nil {
		logger.Panic(err)
	}

	grpcClient, err := cosmos.NewGRPCClient(cfg)
	if err != nil {
		logger.Panic(err)
	}
	defer grpcClient.Shutdown()

	go api.Start(httpClient, grpcClient, errChan)

	select {
	case err := <-errChan:
		logger.Panic(err)
	case <-sigChan:
		grpcClient.Shutdown()
		os.Exit(0)
	}
}
