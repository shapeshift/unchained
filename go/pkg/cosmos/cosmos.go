// Package cosmos provides a cosmos-sdk/tendermint client wrapper with support for both http and grpc.
package cosmos

import (
	"context"

	"github.com/cosmos/cosmos-sdk/codec"
	cryptotypes "github.com/cosmos/cosmos-sdk/codec/types"
	cryptocodec "github.com/cosmos/cosmos-sdk/crypto/codec"
	"github.com/cosmos/cosmos-sdk/simapp/params"
	sdk "github.com/cosmos/cosmos-sdk/types"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/cosmos/cosmos-sdk/x/auth/tx"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	govtypes "github.com/cosmos/cosmos-sdk/x/gov/types"
	ibctransfertypes "github.com/cosmos/cosmos-sdk/x/ibc/applications/transfer/types"
	ibcclienttypes "github.com/cosmos/cosmos-sdk/x/ibc/core/02-client/types"
	ibcchanneltypes "github.com/cosmos/cosmos-sdk/x/ibc/core/04-channel/types"
	ibctenderminttypes "github.com/cosmos/cosmos-sdk/x/ibc/light-clients/07-tendermint/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/internal/log"
	tendermintclient "github.com/shapeshift/go-unchained/pkg/tendermint/client"
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
	ctx := context.Background()

	sdk.GetConfig().SetBech32PrefixForAccount(conf.Bech32AddrPrefix, conf.Bech32PkPrefix)

	tConf := tendermintclient.NewConfiguration()
	tConf.Scheme = "https"
	tConf.Servers = []tendermintclient.ServerConfiguration{{URL: conf.RPCURL}}
	tConf.AddDefaultHeader("Authorization", conf.APIKey)
	tClient := tendermintclient.NewAPIClient(tConf)

	// untyped resty http clients
	headers := map[string]string{"Accept": "application/json", "Authorization": conf.APIKey}
	cosmos := resty.New().SetScheme("https").SetBaseURL(conf.LCDURL).SetHeaders(headers)
	tendermint := resty.New().SetScheme("https").SetBaseURL(conf.RPCURL).SetHeaders(headers)

	c := &HTTPClient{
		ctx:              ctx,
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

	md := metadata.Pairs("Authorization", conf.APIKey)
	ctx := metadata.NewOutgoingContext(context.Background(), md)

	grpcConn, err := grpc.DialContext(
		context.Background(),
		conf.GRPCURL,
		grpc.WithTransportCredentials(credentials.NewTLS(nil)), // The Cosmos SDK doesn't support any transport security mechanism.
	)
	if err != nil {
		return nil, errors.Wrapf(err, "unable to connect to: %s", conf.GRPCURL)
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
func NewEncoding(registerInterfaces ...func(r cryptotypes.InterfaceRegistry)) *params.EncodingConfig {
	registry := cryptotypes.NewInterfaceRegistry()

	// register base protobuf types
	banktypes.RegisterInterfaces(registry)
	cryptocodec.RegisterInterfaces(registry)
	distributiontypes.RegisterInterfaces(registry)
	govtypes.RegisterInterfaces(registry)
	stakingtypes.RegisterInterfaces(registry)
	ibcchanneltypes.RegisterInterfaces(registry)
	ibcclienttypes.RegisterInterfaces(registry)
	ibctenderminttypes.RegisterInterfaces(registry)
	ibctransfertypes.RegisterInterfaces(registry)

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
