package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/shapeshift/go-unchained/coinstacks/cosmos/api"
	"github.com/shapeshift/go-unchained/internal/config"
	"github.com/shapeshift/go-unchained/internal/log"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
	"github.com/shapeshift/go-unchained/pkg/tendermint"
	"github.com/shapeshift/go-unchained/pkg/websocket"
)

var logger = log.WithoutFields()

var confPath = flag.String("config", "cmd/cosmos/config.json", "path to configuration file")
var swaggerPath = flag.String("swagger", "/app/coinstacks/cosmos/api/swagger.json", "path to swagger spec")

// Config for running application
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
		logger.Panicf("%+v", err)
	}

	encoding := cosmos.NewEncoding()

	cfg := cosmos.Config{
		APIKey:           conf.APIKey,
		Bech32AddrPrefix: "cosmos",
		Bech32PkPrefix:   "cosmospub",
		Encoding:         encoding,
		GRPCURL:          conf.GRPCURL,
		LCDURL:           conf.LCDURL,
		RPCURL:           conf.RPCURL,
	}

	httpClient, err := cosmos.NewHTTPClient(cfg)
	if err != nil {
		logger.Panicf("%+v", err)
	}

	grpcClient, err := cosmos.NewGRPCClient(cfg)
	if err != nil {
		logger.Panicf("%+v", err)
	}

	url := fmt.Sprintf("wss://%s/websocket", cfg.RPCURL)
	header := http.Header{}
	header.Add("Authorization", cfg.APIKey)

	wsClient, err := websocket.NewClient(url, header, nil)
	if err != nil {
		logger.Panic(err)
	}

	wsClient2, err := tendermint.NewWebsocketClient(cfg)
	if err != nil {
		logger.Panic(err)
	}

	err = wsClient2.Start()
	if err != nil {
		logger.Panic(err)
	}

	api := api.New(httpClient, grpcClient, wsClient, *swaggerPath)
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
