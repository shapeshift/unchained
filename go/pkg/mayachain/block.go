package mayachain

import (
	"strconv"
	"strings"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/shared/cosmossdk"
	tendermintjson "github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	rpctypes "github.com/tendermint/tendermint/rpc/jsonrpc/types"
)

func (c *HTTPClient) GetBlock(height *int) (*cosmossdk.ResultBlock, error) {
	res := &rpctypes.RPCResponse{}

	hs := ""
	label := "latest"
	if height != nil {
		hs = strconv.Itoa(*height)
		label = hs
	}

	resp, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParam("height", hs).Get("/block")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %s", label)
	}

	if res.Error != nil {
		return nil, errors.Errorf("failed to get block: %s: %s", label, res.Error.Error())
	}

	if err := cosmossdk.CheckResponse(resp); err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %s", label)
	}

	result := &coretypes.ResultBlock{}
	if err := tendermintjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal block result: %s", res.Result)
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

	resp, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParams(queryParams).Get("/block_search")
	if err != nil {
		return nil, errors.Wrap(err, "failed to search blocks")
	}

	if res.Error != nil {
		if strings.Contains(res.Error.Data, "page should be within") {
			return &coretypes.ResultBlockSearch{Blocks: []*coretypes.ResultBlock{}, TotalCount: 0}, nil
		}
		return nil, errors.Wrap(errors.New(res.Error.Error()), "failed to search blocks")
	}

	if err := cosmossdk.CheckResponse(resp); err != nil {
		return nil, errors.Wrap(err, "failed to search blocks")
	}

	result := &coretypes.ResultBlockSearch{}
	if err := tendermintjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal block search result: %s", res.Result)
	}

	return result, nil
}

func (c *HTTPClient) BlockResults(height int) (cosmossdk.BlockResults, error) {
	res := &rpctypes.RPCResponse{}

	resp, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParam("height", strconv.Itoa(height)).Get("/block_results")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block results for block: %v", height)
	}

	if res.Error != nil {
		return nil, errors.Wrapf(errors.New(res.Error.Error()), "failed to get block results for block: %v", height)
	}

	if err := cosmossdk.CheckResponse(resp); err != nil {
		return nil, errors.Wrapf(err, "failed to get block results for block: %v", height)
	}

	result := &coretypes.ResultBlockResults{}
	if err := tendermintjson.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal block result: %s", res.Result)
	}

	return &ResultBlockResults{result}, nil
}
