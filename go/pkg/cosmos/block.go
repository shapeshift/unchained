package cosmos

import (
	"strconv"
	"sync"
	"time"

	"github.com/pkg/errors"
)

type BlockService struct {
	Latest     *Block
	Blocks     map[int]*Block
	m          sync.RWMutex
	httpClient *HTTPClient
}

func NewBlockService(httpClient *HTTPClient) (*BlockService, error) {
	s := &BlockService{
		Blocks:     make(map[int]*Block),
		httpClient: httpClient,
	}

	block, err := s.httpClient.GetBlock(nil)
	if err != nil {
		return nil, errors.WithStack(err)
	}

	s.WriteBlock(block, true)

	return s, nil
}

func (s *BlockService) WriteBlock(block *Block, latest bool) {
	s.m.Lock()
	if latest {
		s.Latest = block
	}
	s.Blocks[block.Height] = block
	s.m.Unlock()
}

func (s *BlockService) GetBlock(height int) (*Block, error) {
	logger.Infof("GetBlock %d", height)
	s.m.RLock()
	block, ok := s.Blocks[height]
	s.m.RUnlock()

	if ok {
		logger.Info("Returning block from cache %s", block.Hash)
		return block, nil
	}

	logger.Info("not in cache, getting from node")
	block, err := s.httpClient.GetBlock(&height)
	if err != nil {
		return nil, errors.WithStack(err)
	}

	s.WriteBlock(block, false)

	return block, nil
}

func (c *HTTPClient) GetBlock(height *int) (*Block, error) {
	logger.Infof("GetBlock() %s", height)
	var res *BlockResponse
	var resErr *struct {
		RPCErrorResponse
		Message string `json:"message"`
	}
	logger.Info("GetBlock() 1")
	req := c.tendermint.R().SetResult(&res).SetError(&resErr)
	logger.Info("GetBlock() 2")

	if height != nil {
		req.SetQueryParams(map[string]string{"height": strconv.Itoa(*height)})
	}
	logger.Info("GetBlock() 3")

	r, err := req.Get("/block")

	body := r.Body()

	if len(body) > 2000 {
		body = body[:2000]
	}
	logger.Infof("resty response: %d %s", r.StatusCode(), body)

	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %d", height)
	}
	logger.Info("GetBlock() 4")

	if resErr != nil {
		if resErr.Message != "" {
			return nil, errors.Errorf("failed to get block: %d: %s", height, resErr.Message)
		}

		return nil, errors.Errorf("failed to get block: %d: %s", height, resErr.Error.Data)
	}
	logger.Info("GetBlock() blocktime", res.Result.Block.Header.Time)
	timestamp, err := time.Parse(time.RFC3339, res.Result.Block.Header.Time)
	if err != nil {
		logger.Errorf("failed to parse timestamp: %s", res.Result.Block.Header.Time)
		timestamp = time.Now()
	}

	h, err := strconv.Atoi(res.Result.Block.Header.Height)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to convert block height: %s", res.Result.Block.Header.Height)
	}

	b := &Block{
		Height:    h,
		Hash:      res.Result.BlockID.Hash,
		Timestamp: int(timestamp.Unix()),
	}

	return b, nil
}
