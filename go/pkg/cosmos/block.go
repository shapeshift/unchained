package cosmos

import (
	"strconv"
	"strings"
	"sync"

	"github.com/cometbft/cometbft/libs/json"
	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	rpctypes "github.com/cometbft/cometbft/rpc/jsonrpc/types"
	"github.com/pkg/errors"
)

type BlockFetcher interface {
	GetBlock(height *int) (*coretypes.ResultBlock, error)
}

type BlockService struct {
	Latest     *BlockResponse
	Blocks     map[int]*BlockResponse
	m          sync.RWMutex
	httpClient BlockFetcher
}

func NewBlockService(httpClient BlockFetcher) (*BlockService, error) {
	s := &BlockService{
		Blocks:     make(map[int]*BlockResponse),
		httpClient: httpClient,
	}

	result, err := s.httpClient.GetBlock(nil)
	if err != nil {
		return nil, errors.WithStack(err)
	}

	block := &BlockResponse{
		Height:    int(result.Block.Height),
		Hash:      result.Block.Hash().String(),
		Timestamp: int(result.Block.Time.Unix()),
	}

	s.WriteBlock(block, true)

	return s, nil
}

func (s *BlockService) WriteBlock(block *BlockResponse, latest bool) {
	s.m.Lock()
	if latest {
		s.Latest = block
	}
	s.Blocks[block.Height] = block
	s.m.Unlock()
}

func (s *BlockService) GetBlock(height int) (*BlockResponse, error) {
	if block, ok := s.Blocks[height]; ok {
		return block, nil
	}

	result, err := s.httpClient.GetBlock(&height)
	if err != nil {
		return nil, errors.WithStack(err)
	}

	block := &BlockResponse{
		Height:    int(result.Block.Height),
		Hash:      result.Block.Hash().String(),
		Timestamp: int(result.Block.Time.Unix()),
	}

	s.WriteBlock(block, false)

	return block, nil
}

func (c *HTTPClient) GetBlock(height *int) (*coretypes.ResultBlock, error) {
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
	if err := json.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Errorf("failed to unmarshal block result: %v: %s", res.Result, res.Error.Error())
	}

	return result, nil
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
	if err := json.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal block search result: %v", res.Result)
	}

	return result, nil
}

func (c *HTTPClient) BlockResults(height int) (*coretypes.ResultBlockResults, error) {
	res := &rpctypes.RPCResponse{}

	_, err := c.RPC.R().SetResult(res).SetError(res).SetQueryParam("height", strconv.Itoa(height)).Get("/block_results")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block results for block: %v", height)
	}

	if res.Error != nil {
		return nil, errors.Wrapf(errors.New(res.Error.Error()), "failed to get block results for block: %v", height)
	}

	result := &coretypes.ResultBlockResults{}
	if err := json.Unmarshal(res.Result, result); err != nil {
		return nil, errors.Wrapf(err, "failed to unmarshal block result: %v", res.Result)
	}

	return result, nil
}
