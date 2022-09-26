package cosmos

import (
	"strconv"
	"sync"

	"github.com/pkg/errors"
	tmjson "github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	rpctypes "github.com/tendermint/tendermint/rpc/jsonrpc/types"
)

type BlockFetcher interface {
	GetBlock(height *int) (*BlockResponse, error)
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

	block, err := s.httpClient.GetBlock(nil)
	if err != nil {
		return nil, errors.WithStack(err)
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

	block, err := s.httpClient.GetBlock(&height)
	if err != nil {
		return nil, errors.WithStack(err)
	}

	s.WriteBlock(block, false)

	return block, nil
}

func (c *HTTPClient) GetBlock(height *int) (*BlockResponse, error) {
	var res *rpctypes.RPCResponse

	hs := ""
	if height != nil {
		hs = strconv.Itoa(*height)
	}

	_, err := c.RPC.R().SetResult(&res).SetQueryParam("height", hs).Get("/block")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %d", height)
	}

	if res.Error != nil {
		return nil, errors.Errorf("failed to get block: %s: %s", hs, res.Error.Error())
	}

	block := &coretypes.ResultBlock{}
	if err := tmjson.Unmarshal(res.Result, block); err != nil {
		return nil, errors.Errorf("failed to unmarshal block result: %v: %s", res.Result, res.Error.Error())
	}

	b := &BlockResponse{
		Height:    int(block.Block.Height),
		Hash:      block.BlockID.Hash.String(),
		Timestamp: int(block.Block.Time.Unix()),
	}

	return b, nil
}
