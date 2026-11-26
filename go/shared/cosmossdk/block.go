package cosmossdk

import (
	"sync"
	"time"

	"github.com/pkg/errors"
)

const latestBlockStaleAfter = 5 * time.Minute

type ResultBlock struct {
	Height int64     `json:"height"`
	Time   time.Time `json:"time"`
	Hash   string    `json:"hash"`
}

type BlockFetcher interface {
	GetBlock(height *int) (*ResultBlock, error)
}

type BlockService struct {
	Latest           *BlockResponse
	Blocks           map[int]*BlockResponse
	m                sync.RWMutex
	httpClient       BlockFetcher
	latestAdvancedAt time.Time
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
		Height:    int(result.Height),
		Hash:      result.Hash,
		Timestamp: int(result.Time.Unix()),
	}

	s.WriteBlock(block, true)

	return s, nil
}

func (s *BlockService) WriteBlock(block *BlockResponse, latest bool) {
	s.m.Lock()
	if latest && (s.Latest == nil || block.Height > s.Latest.Height) {
		s.Latest = block
		s.latestAdvancedAt = time.Now()
	}
	s.Blocks[block.Height] = block
	s.m.Unlock()
}

func (s *BlockService) ReadBlock(height int) (*BlockResponse, bool) {
	s.m.RLock()
	block, ok := s.Blocks[height]
	s.m.RUnlock()
	return block, ok
}

func (s *BlockService) GetBlock(height int) (*BlockResponse, error) {
	s.m.RLock()
	block, ok := s.Blocks[height]
	s.m.RUnlock()
	if ok {
		return block, nil
	}

	result, err := s.httpClient.GetBlock(&height)
	if err != nil {
		return nil, errors.WithStack(err)
	}

	block = &BlockResponse{
		Height:    int(result.Height),
		Hash:      result.Hash,
		Timestamp: int(result.Time.Unix()),
	}

	s.WriteBlock(block, false)

	return block, nil
}

func (s *BlockService) MonitorLatest(errChan chan<- error) {
	ticker := time.NewTicker(latestBlockStaleAfter / 10)
	defer ticker.Stop()

	for range ticker.C {
		s.m.RLock()
		height, advancedAt := s.Latest.Height, s.latestAdvancedAt
		s.m.RUnlock()

		if time.Since(advancedAt) < latestBlockStaleAfter {
			continue
		}

		select {
		case errChan <- errors.Errorf("latest block height %d has not advanced since %s", height, advancedAt.Format(time.RFC3339)):
		default:
		}

		return
	}
}
