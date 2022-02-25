// Package cosmos provides a cosmos-sdk/tendermint client wrapper with support for both http and grpc.
package cosmos

import (
	"context"
	"net/url"

	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/simapp/params"
	stdtypes "github.com/cosmos/cosmos-sdk/std"
	sdk "github.com/cosmos/cosmos-sdk/types"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/cosmos/cosmos-sdk/x/auth/tx"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	govtypes "github.com/cosmos/cosmos-sdk/x/gov/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v3/modules/apps/transfer/types"
	ibccoretypes "github.com/cosmos/ibc-go/v3/modules/core/types"
	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/internal/log"
	tendermintclient "github.com/shapeshift/unchained/pkg/tendermint/client"
	liquiditytypes "github.com/tendermint/liquidity/x/liquidity/types"
	abcitypes "github.com/tendermint/tendermint/abci/types"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
)

var logger = log.WithoutFields()

// Config for cosmos
type Config struct {
	APIKey           string
	Bech32AddrPrefix string
	Bech32PkPrefix   string
	Encoding         *params.EncodingConfig
	GRPCURL          string
	LCDURL           string
	RPCURL           string
	WSURL            string
}

// HTTPClient allows communicating over http
type HTTPClient struct {
	ctx      context.Context
	encoding *params.EncodingConfig

	cosmos           *resty.Client
	tendermint       *resty.Client
	tendermintClient *tendermintclient.APIClient
}

// NewHTTPClient configures and creates an HTTPClient
func NewHTTPClient(conf Config) (*HTTPClient, error) {
	sdk.GetConfig().SetBech32PrefixForAccount(conf.Bech32AddrPrefix, conf.Bech32PkPrefix)

	lcdURL, err := url.Parse(conf.LCDURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse LCDURL: %s", conf.LCDURL)
	}

	rpcURL, err := url.Parse(conf.RPCURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse RPCURL: %s", conf.RPCURL)
	}

	tConf := tendermintclient.NewConfiguration()
	tConf.Scheme = rpcURL.Scheme
	tConf.Servers = []tendermintclient.ServerConfiguration{{URL: rpcURL.Host}}
	tConf.AddDefaultHeader("Authorization", conf.APIKey)
	tClient := tendermintclient.NewAPIClient(tConf)

	// untyped resty http clients
	headers := map[string]string{"Accept": "application/json", "Authorization": conf.APIKey}
	cosmos := resty.New().SetScheme(lcdURL.Scheme).SetBaseURL(lcdURL.Host).SetHeaders(headers)
	tendermint := resty.New().SetScheme(rpcURL.Scheme).SetBaseURL(rpcURL.Host).SetHeaders(headers)

	c := &HTTPClient{
		ctx:              context.Background(),
		encoding:         conf.Encoding,
		cosmos:           cosmos,
		tendermint:       tendermint,
		tendermintClient: tClient,
	}

	return c, nil
}

// GRPCClient allows communicating over grpc
type GRPCClient struct {
	ctx      context.Context
	encoding *params.EncodingConfig
	grpcConn *grpc.ClientConn

	abci         abcitypes.ABCIApplicationClient
	auth         authtypes.QueryClient
	bank         banktypes.QueryClient
	distribution distributiontypes.QueryClient
	staking      stakingtypes.QueryClient
	tx           txtypes.ServiceClient
}

// NewGRPCClient configures and creates a GRPClient
func NewGRPCClient(conf Config) (*GRPCClient, error) {
	sdk.GetConfig().SetBech32PrefixForAccount(conf.Bech32AddrPrefix, conf.Bech32PkPrefix)

	grpcURL, err := url.Parse(conf.GRPCURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse GRPCURL: %s", conf.GRPCURL)
	}

	md := metadata.Pairs("Authorization", conf.APIKey)
	ctx := metadata.NewOutgoingContext(context.Background(), md)

	grpcConn, err := grpc.DialContext(
		context.Background(),
		grpcURL.String(),
		grpc.WithTransportCredentials(credentials.NewTLS(nil)), // The Cosmos SDK doesn't support any transport security mechanism.
	)
	if err != nil {
		return nil, errors.Wrapf(err, "unable to connect to: %s", grpcURL)
	}

	auth := authtypes.NewQueryClient(grpcConn)
	bank := banktypes.NewQueryClient(grpcConn)
	distribution := distributiontypes.NewQueryClient(grpcConn)
	staking := stakingtypes.NewQueryClient(grpcConn)
	tx := txtypes.NewServiceClient(grpcConn)
	abci := abcitypes.NewABCIApplicationClient(grpcConn)

	c := &GRPCClient{
		ctx:          ctx,
		grpcConn:     grpcConn,
		encoding:     conf.Encoding,
		abci:         abci,
		auth:         auth,
		bank:         bank,
		distribution: distribution,
		staking:      staking,
		tx:           tx,
	}

	return c, nil
}

// Close any GRPCClient connections
func (c *GRPCClient) Close() {
	c.grpcConn.Close()
}

// NewEncoding registers all base protobuf types by default as well as any custom types passed in
func NewEncoding(registerInterfaces ...func(r codectypes.InterfaceRegistry)) *params.EncodingConfig {
	registry := codectypes.NewInterfaceRegistry()

	// register base protobuf types
	banktypes.RegisterInterfaces(registry)
	distributiontypes.RegisterInterfaces(registry)
	govtypes.RegisterInterfaces(registry)
	ibccoretypes.RegisterInterfaces(registry)
	ibctransfertypes.RegisterInterfaces(registry)
	liquiditytypes.RegisterInterfaces(registry)
	stakingtypes.RegisterInterfaces(registry)
	stdtypes.RegisterInterfaces(registry)

	// register custom protobuf types
	for _, r := range registerInterfaces {
		r(registry)
	}

	marshaler := codec.NewProtoCodec(registry)

	return &params.EncodingConfig{
		InterfaceRegistry: registry,
		Marshaler:         marshaler,
		TxConfig:          tx.NewTxConfig(marshaler, tx.DefaultSignModes),
		Amino:             codec.NewLegacyAmino(),
	}
}

func IsValidAddress(address string) bool {
	if _, err := sdk.AccAddressFromBech32(address); err != nil {
		return false
	}

	return true
}
