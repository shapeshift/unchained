package thorchain

import (
	"fmt"
	"math/big"
	"net/url"
	"path"

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
	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/shared/cosmossdk"
	"github.com/shapeshift/unchained/shared/log"
)

var logger = log.WithoutFields()

type Config struct {
	cosmossdk.Config
	INDEXERURL    string
	INDEXERAPIKEY string
}

type APIClient interface {
	cosmossdk.APIClient

	// Block
	BlockSearch(query string, page int, pageSize int) (*coretypes.ResultBlockSearch, error)

	// Transactions
	GetTx(txid string) (*coretypes.ResultTx, error)
	TxSearch(query string, page int, pageSize int) (*coretypes.ResultTxSearch, error)

	// Utility
	GetEncoding() *params.EncodingConfig
}

type HTTPClient struct {
	*cosmossdk.HTTPClient
	Indexer *resty.Client
}

func NewHTTPClient(conf Config) (*HTTPClient, error) {
	httpClient, err := cosmossdk.NewHTTPClient(conf.Config)
	if err != nil {
		logger.Panicf("failed to create new http client: %+v", err)
	}

	indexerURL, err := url.Parse(conf.INDEXERURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse INDEXERURL: %s", conf.INDEXERURL)
	}

	if conf.INDEXERAPIKEY != "" {
		indexerURL.Path = path.Join(indexerURL.Path, fmt.Sprintf("api=%s", conf.INDEXERAPIKEY))
	}

	headers := map[string]string{"Accept": "application/json"}
	indexer := resty.New().SetBaseURL(indexerURL.String()).SetHeaders(headers)

	c := &HTTPClient{
		HTTPClient: httpClient,
		Indexer:    indexer,
	}

	return c, nil
}

func (c *HTTPClient) GetEncoding() *params.EncodingConfig {
	return c.HTTPClient.Encoding.(*params.EncodingConfig)
}

// NewEncoding registers all base protobuf types by default as well as any custom types passed in
func NewEncoding(registerInterfaces ...func(r codectypes.InterfaceRegistry)) *params.EncodingConfig {
	registry := codectypes.NewInterfaceRegistry()

	// register base protobuf types
	authztypes.RegisterInterfaces(registry)
	banktypes.RegisterInterfaces(registry)
	distributiontypes.RegisterInterfaces(registry)
	govv1types.RegisterInterfaces(registry)
	govv1beta1types.RegisterInterfaces(registry)
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

func ParseFee(tx SigningTx, txid string, denom string, nativeFee int) cosmossdk.Value {
	fee := Fee(tx, txid, denom)

	i := new(big.Int)
	i.SetString(fee.Amount, 10)

	// add native fee automatically deducted from every transaction but not tracked as an actual tx fee
	fee.Amount = i.Add(i, big.NewInt(int64(nativeFee))).String()

	return fee
}
