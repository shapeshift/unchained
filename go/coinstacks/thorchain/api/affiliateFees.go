package api

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"sync"
	"time"

	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	"github.com/cometbft/cometbft/types"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/thorchain"
	"golang.org/x/sync/errgroup"
)

const (
	blockWorkers  = 10
	pageSize      = 50
	resultWorkers = 100
)

type AffiliateFeeIndexer struct {
	AffiliateAddresses []string
	AffiliateFees      []*AffiliateFee
	httpClients        []*cosmos.HTTPClient
	mu                 sync.Mutex
}

type AffiliateFee struct {
	Amount      string
	Asset       string
	BlockHeight int64
	BlockHash   string
	Timestamp   int64
	Address     string
	TxID        string
}

func NewAffiliateFeeIndexer(httpClients []*cosmos.HTTPClient, wsClient *cosmos.WSClient) *AffiliateFeeIndexer {
	affiliateAddresses := []string{"thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l", "thor1crs0y53jfg224mettqeg883e6ume49tllktg2s", "thor122h9hlrugzdny9ct95z6g7afvpzu34s73uklju"}

	i := &AffiliateFeeIndexer{
		AffiliateAddresses: affiliateAddresses,
		AffiliateFees:      []*AffiliateFee{},
		httpClients:        httpClients,
	}

	wsClient.NewBlockHandler(func(newBlock types.EventDataNewBlock, blockEvents []cosmos.ABCIEvent) {
		i.processAffiliateFees(&thorchain.NewBlock{EventDataNewBlock: newBlock}, blockEvents, i.AffiliateAddresses)
	})

	return i
}

func (i *AffiliateFeeIndexer) Sync() error {
	start := time.Now()
	logger.Info("Started indexing affiliate fees")

	g := new(errgroup.Group)

	for _, affiliateAddress := range i.AffiliateAddresses {
		for _, httpClient := range i.httpClients {
			g.Go(func() error {
				result, err := httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, affiliateAddress), 1, pageSize)
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

				go i.fetchBlocks(httpClient, affiliateAddress, pageCh, resultCh)
				i.handleBlocks(httpClient, affiliateAddress, resultCh).Wait()

				return nil
			})
		}

		if err := g.Wait(); err != nil {
			return err
		}
	}

	logger.Infof("Finished indexing affiliate fees (%s)", time.Since(start))

	return nil
}

func (i *AffiliateFeeIndexer) fetchBlocks(httpClient *cosmos.HTTPClient, affiliateAddress string, pageCh <-chan int, resultCh chan<- *coretypes.ResultBlockSearch) {
	defer close(resultCh)

	wg := new(sync.WaitGroup)
	wg.Add(blockWorkers)

	for range blockWorkers {
		go func() {
			defer wg.Done()

			for page := range pageCh {
				result, err := httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, affiliateAddress), page, pageSize)
				if err != nil {
					logger.Panicf("failed to fetch blocks for page: %d: %+v", page, err)
				}

				resultCh <- result
			}
		}()
	}

	wg.Wait()
}

func (i *AffiliateFeeIndexer) handleBlocks(httpClient *cosmos.HTTPClient, affiliateAddress string, resultCh <-chan *coretypes.ResultBlockSearch) *sync.WaitGroup {
	wg := new(sync.WaitGroup)
	wg.Add(resultWorkers)

	for range resultWorkers {
		go func() {
			defer wg.Done()

			for result := range resultCh {
				for _, b := range result.Blocks {
					blockResult, err := httpClient.BlockResults(int(b.Block.Height))
					if err != nil {
						logger.Panicf("failed to handle block: %d: %+v", b.Block.Height, err)
					}

					i.processAffiliateFees(&thorchain.ResultBlock{Block: b.Block}, blockResult.GetBlockEvents(), []string{affiliateAddress})
				}
			}
		}()
	}

	return wg
}

func (i *AffiliateFeeIndexer) processAffiliateFees(block thorchain.Block, blockEvents []cosmos.ABCIEvent, affiliateAddresses []string) {
	_, typedEvents, err := thorchain.ParseBlockEvents(blockEvents)
	if err != nil {
		logger.Panicf("failed to parse block events for block: %d: %+v", block.Height(), err)
	}

	swaps := make(map[string]*thorchain.EventSwap)
	affiliateFees := make([]*AffiliateFee, 0)
	for _, event := range typedEvents {
		switch v := event.(type) {
		case *thorchain.EventOutbound:
			coinParts := strings.Fields(v.Coin)
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
		case *thorchain.EventSwap:
			swaps[v.Id] = v
		default:
			continue
		}
	}

	for _, affiliateFee := range affiliateFees {
		if swap, ok := swaps[affiliateFee.TxID]; ok {
			if slices.Contains(affiliateAddresses, swap.To) {
				continue
			}
		}

		if slices.Contains(affiliateAddresses, affiliateFee.Address) {
			i.mu.Lock()
			i.AffiliateFees = append(i.AffiliateFees, affiliateFee)
			i.mu.Unlock()
		}
	}
}
