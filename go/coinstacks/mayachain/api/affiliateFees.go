package api

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/mayachain"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	"github.com/tendermint/tendermint/types"
	"golang.org/x/sync/errgroup"
)

const (
	blockWorkers  = 10
	pageSize      = 50
	resultWorkers = 100
)

type AffiliateFeeIndexer struct {
	AffiliateAddresses []string
	AffiliateFeeDenoms []string
	AffiliateFees      []*AffiliateFee
	httpClient         *cosmos.HTTPClient
	mu                 sync.Mutex
}

type AffiliateFee struct {
	Amount      string `json:"amount"`
	Asset       string `json:"asset"`
	BlockHeight int64  `json:"blockHeight"`
	BlockHash   string `json:"blockHash"`
	Timestamp   int64  `json:"timestamp"`
	Address     string `json:"address"`
	TxID        string `json:"txId"`
}

func NewAffiliateFeeIndexer(httpClient *cosmos.HTTPClient, wsClient *cosmos.WSClient) *AffiliateFeeIndexer {
	affiliateAddresses := []string{"maya122h9hlrugzdny9ct95z6g7afvpzu34s73tgnyv"}
	affilateFeeDenoms := []string{"MAYA.CACAO"}

	i := &AffiliateFeeIndexer{
		AffiliateAddresses: affiliateAddresses,
		AffiliateFeeDenoms: affilateFeeDenoms,
		AffiliateFees:      []*AffiliateFee{},
		httpClient:         httpClient,
	}

	wsClient.NewBlockHandler(func(newBlock types.EventDataNewBlock, blockEvents []cosmos.ABCIEvent) {
		i.processAffiliateFees(&mayachain.NewBlock{EventDataNewBlock: newBlock}, blockEvents, i.AffiliateAddresses)
	})

	return i
}

func (i *AffiliateFeeIndexer) Sync() error {
	start := time.Now()
	logger.Info("Started indexing affiliate fees")

	g := new(errgroup.Group)

	for _, affiliateAddress := range i.AffiliateAddresses {
		g.Go(func() error {
			result, err := i.httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, affiliateAddress), 1, pageSize)
			if err != nil {
				return err
			}

			maxPages := int(math.Ceil(float64(result.TotalCount) / float64(pageSize)))

			pageCh := make(chan int, maxPages)
			for page := 2; page <= maxPages; page++ {
				pageCh <- page
			}
			close(pageCh)

			resultCh := make(chan *coretypes.ResultBlockSearch, 1)
			resultCh <- result

			go i.fetchBlocks(affiliateAddress, pageCh, resultCh)
			i.handleBlocks(affiliateAddress, resultCh).Wait()

			return nil
		})

		if err := g.Wait(); err != nil {
			return err
		}
	}

	logger.Infof("Finished indexing affiliate fees (%s)", time.Since(start))

	return nil
}

func (i *AffiliateFeeIndexer) fetchBlocks(affiliateAddress string, pageCh <-chan int, resultCh chan<- *coretypes.ResultBlockSearch) {
	defer close(resultCh)

	wg := new(sync.WaitGroup)
	wg.Add(blockWorkers)

	for range blockWorkers {
		go func() {
			defer wg.Done()

			for page := range pageCh {
				result, err := i.httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, affiliateAddress), page, pageSize)
				if err != nil {
					logger.Panicf("failed to fetch blocks for page: %d: %+v", page, err)
				}

				resultCh <- result
			}
		}()
	}

	wg.Wait()
}

func (i *AffiliateFeeIndexer) handleBlocks(affiliateAddress string, resultCh <-chan *coretypes.ResultBlockSearch) *sync.WaitGroup {
	wg := new(sync.WaitGroup)
	wg.Add(resultWorkers)

	for range resultWorkers {
		go func() {
			defer wg.Done()

			for result := range resultCh {
				for _, b := range result.Blocks {
					blockResult, err := i.httpClient.BlockResults(int(b.Block.Height))
					if err != nil {
						logger.Panicf("failed to handle block: %d: %+v", b.Block.Height, err)
					}

					i.processAffiliateFees(&mayachain.ResultBlock{Block: b.Block}, blockResult.GetBlockEvents(), []string{affiliateAddress})
				}
			}
		}()
	}

	return wg
}

func (i *AffiliateFeeIndexer) processAffiliateFees(block mayachain.Block, blockEvents []cosmos.ABCIEvent, affiliateAddresses []string) {
	_, typedEvents, err := mayachain.ParseBlockEvents(blockEvents)
	if err != nil {
		logger.Panicf("failed to parse block events for block: %d: %+v", block.Height(), err)
	}

	swaps := make(map[string]*mayachain.EventSwap)
	affiliateFees := make([]*AffiliateFee, 0)
	for _, event := range typedEvents {
		switch v := event.(type) {
		case *mayachain.EventOutbound:
			coinParts := strings.Fields(v.Coin)
			if slices.Contains(affiliateAddresses, v.To) && slices.Contains(i.AffiliateFeeDenoms, coinParts[1]) {
				affiliateFee := &AffiliateFee{
					BlockHash:   block.Hash(),
					BlockHeight: block.Height(),
					Timestamp:   block.Timestamp(),
					TxID:        v.InTxID,
					Address:     v.To,
					Amount:      coinParts[0],
					Asset:       coinParts[1],
				}
				affiliateFees = append(affiliateFees, affiliateFee)
			}
		case *mayachain.EventSwap:
			parts := strings.Split(v.Memo, ":")
			if len(parts) > 4 && parts[4] == "ssmaya" {
				swaps[v.Id] = v
			}
		default:
			continue
		}
	}

	for _, affiliateFee := range affiliateFees {
		if _, ok := swaps[affiliateFee.TxID]; !ok {
			continue
		}

		i.mu.Lock()
		i.AffiliateFees = append(i.AffiliateFees, affiliateFee)
		i.mu.Unlock()
	}
}
