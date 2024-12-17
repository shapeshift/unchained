package thorchainV1

import (
	"strconv"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/cosmos"
	tendermintjson "github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	rpctypes "github.com/tendermint/tendermint/rpc/jsonrpc/types"
)

type HTTPClient struct {
	*cosmos.HTTPClient
}

func NewHTTPClient(httpClient *cosmos.HTTPClient) *HTTPClient {
	return &HTTPClient{
		HTTPClient: httpClient,
	}
}

type ResultBlockResults struct {
	*coretypes.ResultBlockResults
}

func (r *ResultBlockResults) GetBlockEvents() []cosmos.ABCIEvent {
	blockEvents := make([]cosmos.ABCIEvent, len(r.EndBlockEvents))
	for i, event := range r.EndBlockEvents {
		attributes := make([]cosmos.ABCIEventAttribute, len(event.Attributes))
		for j, attribute := range event.Attributes {
			attributes[j] = cosmos.ABCIEventAttribute{
				Key:   string(attribute.Key),
				Value: string(attribute.Value),
				Index: attribute.Index,
			}
		}
		blockEvents[i] = cosmos.ABCIEvent{
			Type:       event.Type,
			Attributes: attributes,
		}
	}
	return blockEvents
}

func (c *HTTPClient) BlockResults(height int) (cosmos.BlockResults, error) {
	res := &rpctypes.RPCResponse{}

	_, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParam("height", strconv.Itoa(height)).Get("/block_results")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block results for block: %v", height)
	}

	if res.Error != nil {
		return nil, errors.Wrapf(errors.New(res.Error.Error()), "failed to get block results for block: %v", height)
	}

	result := &coretypes.ResultBlockResults{}
	if err := tendermintjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal block result: %v", res.Result)
	}

	return &ResultBlockResults{result}, nil
}
