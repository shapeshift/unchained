package cosmos

import (
	"strconv"
	"strings"

	cometbftjson "github.com/cometbft/cometbft/libs/json"
	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	rpctypes "github.com/cometbft/cometbft/rpc/jsonrpc/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/shared/cosmossdk"
)

func (c *HTTPClient) GetBlock(height *int) (*cosmossdk.ResultBlock, error) {
	res := &rpctypes.RPCResponse{}

	hs := ""
	if height != nil {
		hs = strconv.Itoa(*height)
	}

	_, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParam("height", hs).Get("/block")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %d", height)
	}

	if res.Error != nil {
		return nil, errors.Errorf("failed to get block: %s: %s", hs, res.Error.Error())
	}

	result := &coretypes.ResultBlock{}
	if err := cometbftjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Errorf("failed to unmarshal block result: %v", res.Result)
	}

	b := &cosmossdk.ResultBlock{
		Height: result.Block.Height,
		Time:   result.Block.Time,
		Hash:   result.Block.Hash().String(),
	}

	return b, nil
}

func (c *HTTPClient) BlockSearch(query string, page int, pageSize int) (*coretypes.ResultBlockSearch, error) {
	res := &rpctypes.RPCResponse{}

	queryParams := map[string]string{
		"query":    query,
		"page":     strconv.Itoa(page),
		"per_page": strconv.Itoa(pageSize),
		"order_by": "\"desc\"",
	}

	_, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParams(queryParams).Get("/block_search")
	if err != nil {
		return nil, errors.Wrap(err, "failed to search blocks")
	}

	if res.Error != nil {
		if strings.Contains(res.Error.Data, "page should be within") {
			return &coretypes.ResultBlockSearch{Blocks: []*coretypes.ResultBlock{}, TotalCount: 0}, nil
		}
		return nil, errors.Wrap(errors.New(res.Error.Error()), "failed to search blocks")
	}

	result := &coretypes.ResultBlockSearch{}
	if err := cometbftjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal block search result: %v", res.Result)
	}

	return result, nil
}

func (c *HTTPClient) BlockResults(height int) (cosmossdk.BlockResults, error) {
	res := &rpctypes.RPCResponse{}

	_, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParam("height", strconv.Itoa(height)).Get("/block_results")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block results for block: %v", height)
	}

	if res.Error != nil {
		return nil, errors.Wrapf(errors.New(res.Error.Error()), "failed to get block results for block: %v", height)
	}

	result := &coretypes.ResultBlockResults{}
	if err := cometbftjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal block result: %v", res.Result)
	}

	return &ResultBlockResults{result}, nil
}
