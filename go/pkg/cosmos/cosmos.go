// Package cosmos provides an http client wrapper.
package cosmos

import (
	sdkmath "cosmossdk.io/math"
	"cosmossdk.io/simapp/params"
	abci "github.com/cometbft/cometbft/abci/types"
	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	stdtypes "github.com/cosmos/cosmos-sdk/std"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/tx"
	authztypes "github.com/cosmos/cosmos-sdk/x/authz"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	distributiontypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	govv1types "github.com/cosmos/cosmos-sdk/x/gov/types/v1"
	govv1beta1types "github.com/cosmos/cosmos-sdk/x/gov/types/v1beta1"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	liquidtypes "github.com/cosmos/gaia/v25/x/liquid/types"
	metaprotocolstypes "github.com/cosmos/gaia/v25/x/metaprotocols/types"
	ibclightclientswasmtypes "github.com/cosmos/ibc-go/modules/light-clients/08-wasm/v10/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
	ibccoretypes "github.com/cosmos/ibc-go/v10/modules/core/types"
	ibclightclientstendermint "github.com/cosmos/ibc-go/v10/modules/light-clients/07-tendermint"
	"github.com/shapeshift/unchained/shared/cosmossdk"
	"github.com/shapeshift/unchained/shared/log"
)

var logger = log.WithoutFields()

type HTTPClient struct {
	*cosmossdk.HTTPClient
}

type APIClient interface {
	cosmossdk.APIClient

	// Block
	BlockSearch(query string, page int, pageSize int) (*coretypes.ResultBlockSearch, error)

	// Fees/Gas
	GetGlobalMinimumGasPrices() (map[string]sdkmath.LegacyDec, error)
	GetLocalMinimumGasPrices() (map[string]sdkmath.LegacyDec, error)

	// Transactions
	GetTx(txid string) (*coretypes.ResultTx, error)
	TxSearch(query string, page int, pageSize int) (*coretypes.ResultTxSearch, error)

	// Utility
	GetEncoding() *params.EncodingConfig
}

func NewHTTPClient(conf cosmossdk.Config) (*HTTPClient, error) {
	httpClient, err := cosmossdk.NewHTTPClient(conf)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	c := &HTTPClient{
		HTTPClient: httpClient,
	}

	return c, nil
}

func (c *HTTPClient) GetEncoding() *params.EncodingConfig {
	return c.Encoding.(*params.EncodingConfig)
}

// NewEncoding registers all base protobuf types by default as well as any custom types passed in
func NewEncoding(registerInterfaces ...func(r codectypes.InterfaceRegistry)) *params.EncodingConfig {
	registry := codectypes.NewInterfaceRegistry()

	// register base protobuf types
	authztypes.RegisterInterfaces(registry)
	banktypes.RegisterInterfaces(registry)
	distributiontypes.RegisterInterfaces(registry)
	govv1beta1types.RegisterInterfaces(registry)
	govv1types.RegisterInterfaces(registry)
	ibccoretypes.RegisterInterfaces(registry)
	ibclightclientstendermint.RegisterInterfaces(registry)
	ibclightclientswasmtypes.RegisterInterfaces(registry)
	ibctransfertypes.RegisterInterfaces(registry)
	liquidtypes.RegisterInterfaces(registry)
	metaprotocolstypes.RegisterInterfaces(registry)
	stakingtypes.RegisterInterfaces(registry)
	stdtypes.RegisterInterfaces(registry)

	// register custom protobuf types
	for _, r := range registerInterfaces {
		r(registry)
	}

	protoCodec := codec.NewProtoCodec(registry)

	return &params.EncodingConfig{
		InterfaceRegistry: registry,
		Codec:             protoCodec,
		TxConfig:          tx.NewTxConfig(protoCodec, tx.DefaultSignModes),
		Amino:             codec.NewLegacyAmino(),
	}
}

func CoinToValue(c *sdk.Coin) cosmossdk.Value {
	if c == nil {
		return cosmossdk.Value{}
	}

	return cosmossdk.Value{
		Amount: c.Amount.String(),
		Denom:  c.Denom,
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

func ConvertABCIEvents(events []abci.Event) []cosmossdk.ABCIEvent {
	abciEvents := make([]cosmossdk.ABCIEvent, len(events))
	for i, event := range events {
		attributes := make([]cosmossdk.ABCIEventAttribute, len(event.Attributes))
		for j, attribute := range event.Attributes {
			attributes[j] = cosmossdk.ABCIEventAttribute{
				Key:   attribute.Key,
				Value: attribute.Value,
			}
		}
		abciEvents[i] = cosmossdk.ABCIEvent{
			Type:       event.Type,
			Attributes: attributes,
		}
	}
	return abciEvents
}
