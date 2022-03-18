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
	defer s.m.Unlock()
	s.Current = block
	s.Blocks[block.Height] = block
}

func (s *BlockService) AddBlock(block *Block) {
	s.m.Lock()
	defer s.m.Unlock()
	s.Blocks[block.Height] = block
}

func (s *BlockService) GetBlock(height int) (*Block, error) {
	s.m.RLock()
	defer s.m.RUnlock()
	if block, ok := s.Blocks[strconv.Itoa(height)]; ok {
		return block, nil
	}

	block, err := s.httpClient.GetBlock(height)
	if err != nil {
		return nil, errors.WithStack(err)
	}

	s.Blocks[block.Height] = block

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

	var resErr *RPCErrorResponse

	queryParams := map[string]string{"height": strconv.Itoa(height)}

	_, err := c.tendermint.R().SetResult(&res).SetError(&resErr).SetQueryParams(queryParams).Get("/block")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %d", height)
	}

	if resErr != nil {
		return nil, errors.Errorf("failed to get block: %s", resErr.Error.Data)
	}

	b := &Block{
		Height:    res.Result.Block.Header.Height,
		Hash:      res.Result.BlockID.Hash,
		Timestamp: res.Result.Block.Header.Time,
	}

	return b, nil
}
