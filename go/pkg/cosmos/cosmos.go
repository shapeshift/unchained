// Package cosmos provides a cosmos-sdk/tendermint client wrapper with support for both http and grpc.
package cosmos

import (
	"context"
	"net/url"
	"reflect"
	"regexp"
	"strings"

	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/simapp/params"
	stdtypes "github.com/cosmos/cosmos-sdk/std"
	sdk "github.com/cosmos/cosmos-sdk/types"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/cosmos/cosmos-sdk/x/auth/tx"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	authztypes "github.com/cosmos/cosmos-sdk/x/authz"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	govtypes "github.com/cosmos/cosmos-sdk/x/gov/types"
	minttypes "github.com/cosmos/cosmos-sdk/x/mint/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v3/modules/apps/transfer/types"
	ibccoretypes "github.com/cosmos/ibc-go/v3/modules/core/types"
	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/internal/log"
	liquiditytypes "github.com/tendermint/liquidity/x/liquidity/types"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
)

var logger = log.WithoutFields()

// Config for cosmos
type Config struct {
	Bech32AddrPrefix  string
	Bech32ValPrefix   string
	Bech32PkPrefix    string
	Bech32PkValPrefix string
	Encoding          *params.EncodingConfig
	GRPCURL           string
	LCDURL            string
	RPCURL            string
	WSURL             string
}

// HTTPClient allows communicating over http
type HTTPClient struct {
	ctx      context.Context
	encoding *params.EncodingConfig
	LCD      *resty.Client
	RPC      *resty.Client
}

// NewHTTPClient configures and creates an HTTPClient
func NewHTTPClient(conf Config) (*HTTPClient, error) {
	sdk.GetConfig().SetBech32PrefixForAccount(conf.Bech32AddrPrefix, conf.Bech32PkPrefix)
	sdk.GetConfig().SetBech32PrefixForValidator(conf.Bech32ValPrefix, conf.Bech32PkValPrefix)

	lcdURL, err := url.Parse(conf.LCDURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse LCDURL: %s", conf.LCDURL)
	}

	rpcURL, err := url.Parse(conf.RPCURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse RPCURL: %s", conf.RPCURL)
	}

	// untyped resty http clients
	headers := map[string]string{"Accept": "application/json"}
	lcd := resty.New().SetBaseURL(lcdURL.String()).SetHeaders(headers)
	rpc := resty.New().SetBaseURL(rpcURL.String()).SetHeaders(headers)

	c := &HTTPClient{
		ctx:      context.Background(),
		encoding: conf.Encoding,
		LCD:      lcd,
		RPC:      rpc,
	}

	return c, nil
}

func (c *HTTPClient) GetEncoding() *params.EncodingConfig {
	return c.encoding
}

// GRPCClient allows communicating over grpc
type GRPCClient struct {
	ctx      context.Context
	encoding *params.EncodingConfig
	grpcConn *grpc.ClientConn

	auth         authtypes.QueryClient
	bank         banktypes.QueryClient
	distribution distributiontypes.QueryClient
	mint         minttypes.QueryClient
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

	md := metadata.Pairs()
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
	mint := minttypes.NewQueryClient(grpcConn)
	staking := stakingtypes.NewQueryClient(grpcConn)
	tx := txtypes.NewServiceClient(grpcConn)

	c := &GRPCClient{
		ctx:          ctx,
		grpcConn:     grpcConn,
		encoding:     conf.Encoding,
		auth:         auth,
		bank:         bank,
		distribution: distribution,
		mint:         mint,
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
	authztypes.RegisterInterfaces(registry)
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

func CoinToValue(c *sdk.Coin) Value {
	if c == nil {
		return Value{}
	}

	return Value{
		Amount: c.Amount.String(),
		Denom:  c.Denom,
	}
}

func PoolEventAmountToValues(s string) []Value {
	ret := []Value{}

	if s == "" {
		return ret
	}

	for _, t := range strings.Split(s, ",") {
		v := SerializedPoolTransferStringtoValue(t)
		if reflect.DeepEqual(v, Value{}) {
			return []Value{}
		}
		ret = append(ret, v)
	}

	return ret
}

func SerializedPoolTransferStringtoValue(s string) Value {
	if s == "" {
		return Value{}
	}

	isNonNumeric := regexp.MustCompile(`\D`)
	denomIdx := isNonNumeric.FindStringIndex(s)
	if denomIdx == nil {
		return Value{}
	}
	return Value{
		Amount: s[:denomIdx[0]],
		Denom:  s[denomIdx[0]:],
	}
}

func IsValidAddress(address string) bool {
	if _, err := sdk.AccAddressFromBech32(address); err != nil {
		return false
	}

	return true
}

func IsValidValidatorAddress(address string) bool {
	if _, err := sdk.ValAddressFromBech32(address); err != nil {
		return false
	}

	return true
}
