package cosmos

import (
	"strconv"
	"sync"

	"github.com/pkg/errors"
)

type BlockService struct {
	Current    *Block
	Blocks     map[string]*Block
	m          sync.RWMutex
	httpClient *HTTPClient
}

func NewBlockService(httpClient *HTTPClient) *BlockService {
	// TODO: set current on construction
	return &BlockService{
		Blocks:     make(map[string]*Block),
		httpClient: httpClient,
	}
}

func (s *BlockService) NewBlock(block *Block) {
	s.m.Lock()
	s.Current = block
	s.Blocks[block.Height] = block
	s.m.Unlock()
}

func (s *BlockService) GetBlock(height int) (*Block, error) {
	s.m.RLock()
	block, ok := s.Blocks[strconv.Itoa(height)]
	s.m.RUnlock()

	if ok {
		return block, nil
	}

	block, err := s.httpClient.GetBlock(height)
	if err != nil {
		return nil, errors.WithStack(err)
	}

	s.m.Lock()
	s.Blocks[block.Height] = block
	s.m.Unlock()

	return block, nil
}

func (c *HTTPClient) GetBlock(height int) (*Block, error) {
	var res struct {
		Result struct {
			BlockID struct {
				Hash string `json:"hash"`
			} `json:"block_id"`
			Block struct {
				Header struct {
					Height string `json:"height"`
					Time   string `json:"time"`
				} `json:"header"`
			} `json:"block"`
		} `json:"result"`
	}

	var resErr *struct {
		RPCErrorResponse
		Message string `json:"message"`
	}

	queryParams := map[string]string{"height": strconv.Itoa(height)}

	_, err := c.tendermint.R().SetResult(&res).SetError(&resErr).SetQueryParams(queryParams).Get("/block")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %d", height)
	}

	if resErr != nil {
		if resErr.Message != "" {
			return nil, errors.Errorf("failed to get block: %d: %s", height, resErr.Message)
		}

		return nil, errors.Errorf("failed to get block: %d: %s", height, resErr.Error.Data)
	}

	b := &Block{
		Height:    res.Result.Block.Header.Height,
		Hash:      res.Result.BlockID.Hash,
		Timestamp: res.Result.Block.Header.Time,
	}

	return b, nil
}
