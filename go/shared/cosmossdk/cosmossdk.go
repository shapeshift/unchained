package cosmossdk

import (
	"context"
	"fmt"
	"math/big"
	"net/url"
	"path"
	"strings"

	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/shared/log"
)

var logger = log.WithoutFields()

type Config struct {
	Bech32AddrPrefix  string
	Bech32ValPrefix   string
	Bech32PkPrefix    string
	Bech32PkValPrefix string
	Denom             string
	NativeFee         int
	Encoding          interface{}
	LCDAPIKEY         string
	LCDURL            string
	RPCAPIKEY         string
	RPCURL            string
	WSURL             string
	WSAPIKEY          string
}

type HTTPClient struct {
	ctx      context.Context
	Denom    string
	Encoding interface{}
	LCD      *resty.Client
	RPC      *resty.Client
}

type APIClient interface {
	// Account
	GetAccount(address string) (*AccountResponse, error)
	GetBalance(address string, baseDenom string) (*BalanceResponse, error)
	GetDelegations(address string, apr *big.Float) ([]Delegation, error)
	GetRedelegations(address string, apr *big.Float) ([]Redelegation, error)
	GetUnbondings(address string, baseDenom string, apr *big.Float) ([]Unbonding, error)
	GetRewards(address string, apr *big.Float) ([]Reward, error)

	// Bank
	GetTotalSupply(denom string) (string, error)
	GetAnnualProvisions() (string, error)
	GetCommunityTax() (string, error)
	GetBondedTokens() (string, error)

	// Block
	GetBlock(height *int) (*ResultBlock, error)
	BlockResults(height int) (BlockResults, error)

	// Fees/Gas
	GetEstimateGas(rawTx string) (string, error)

	// Staking
	GetValidators(apr *big.Float, cursor string, pageSize int) (*ValidatorsResponse, error)
	GetValidator(addr string, apr *big.Float) (*Validator, error)

	// Transactions
	GetTxHistory(address string, cursor string, pageSize int, sources map[string]*TxState) (*TxHistoryResponse, error)
	BroadcastTx(rawTx string) (string, error)
}

func NewHTTPClient(conf Config) (*HTTPClient, error) {
	lcdURL, err := url.Parse(conf.LCDURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse LCDURL: %s", conf.LCDURL)
	}

	rpcURL, err := url.Parse(conf.RPCURL)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to parse RPCURL: %s", conf.RPCURL)
	}

	lcdHeaders := map[string]string{"Content-Type": "application/json"}
	if conf.LCDAPIKEY != "" {
		isLiquify := strings.Contains(conf.LCDURL, "liquify")
		if isLiquify {
			lcdURL.Path = path.Join(lcdURL.Path, fmt.Sprintf("api=%s", conf.LCDAPIKEY))
		}

		isNownodes := strings.Contains(conf.LCDURL, "nownodes")
		if isNownodes {
			lcdHeaders["Authorization"] = fmt.Sprintf("Basic %s", conf.LCDAPIKEY)
		}
	}

	rpcHeaders := map[string]string{"Content-Type": "application/json"}
	if conf.RPCAPIKEY != "" {
		isLiquify := strings.Contains(conf.RPCURL, "liquify")
		if isLiquify {
			rpcURL.Path = path.Join(rpcURL.Path, fmt.Sprintf("api=%s", conf.RPCAPIKEY))
		}

		isNownodes := strings.Contains(conf.RPCURL, "nownodes")
		if isNownodes {
			rpcHeaders["Authorization"] = fmt.Sprintf("Basic %s", conf.LCDAPIKEY)
		}
	}

	lcd := resty.New().SetBaseURL(lcdURL.String()).SetHeaders(lcdHeaders)
	rpc := resty.New().SetBaseURL(rpcURL.String()).SetHeaders(rpcHeaders)

	c := &HTTPClient{
		ctx:      context.Background(),
		Denom:    conf.Denom,
		Encoding: conf.Encoding,
		LCD:      lcd,
		RPC:      rpc,
	}

	return c, nil
}
