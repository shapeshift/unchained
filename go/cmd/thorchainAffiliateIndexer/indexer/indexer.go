package indexer

import (
	"fmt"
	"math"
	"strings"
	"sync"

	"github.com/shapeshift/unchained/coinstacks/thorchain"
	"github.com/shapeshift/unchained/pkg/cosmos"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	tmtypes "github.com/tendermint/tendermint/types"
)

const (
	workers          = 10
	pageSize         = 25
	affiliateAddress = "thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l"
)

type Indexer struct {
	HTTPClient    *cosmos.HTTPClient
	AffiliateFees []*AffiliateFee
	wg            sync.WaitGroup
	resultCh      chan *coretypes.ResultBlockSearch
	pageCh        chan int
	errChan       chan<- error
	mu            sync.Mutex
	maxPages      *int
}

type AffiliateFee struct {
	Amount      string
	Asset       string
	BlockHeight int64
	BlockHash   string
	Timestamp   int
	Address     string
	TxID        string
}

func NewIndexer(httpClient *cosmos.HTTPClient) *Indexer {
	return &Indexer{
		HTTPClient:    httpClient,
		AffiliateFees: []*AffiliateFee{},
		resultCh:      make(chan *coretypes.ResultBlockSearch, workers),
		pageCh:        make(chan int),
	}
}

func (i *Indexer) Sync() {
	// create wait group for the workers
	i.wg.Add(workers)

	// kick off all of the workers
	for j := 0; j < workers; j++ {
		go i.FetchBlocks()
	}

	// process affiliate fees in parallel as we get back block results
	go func() {
		for result := range i.resultCh {
			for _, b := range result.Blocks {
				go i.ProcessAffiliateFees(b.Block)
			}
		}
	}()

	// hydrate our page channel to paginate through all of the blocks until we reach the last page
	// once the last page is reached close the page channel which will prompt all of the workers to finish up their work and exit
	go func() {
		defer i.mu.Unlock()

		page := 1
		for {
			i.mu.Lock()
			if i.maxPages != nil && page > *i.maxPages {
				close(i.pageCh)
				break
			}
			i.mu.Unlock()
			i.pageCh <- page
			page++
		}
	}()

	// wait for all workers to exit
	i.wg.Wait()

	// clean up the result channel once sync is complete
	close(i.resultCh)
}

func (i *Indexer) FetchBlocks() {
	defer i.wg.Done()

	for page := range i.pageCh {
		result, err := i.HTTPClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, "thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l"), page, pageSize)
		if err != nil {
			i.errChan <- err
		}

		i.resultCh <- result

		i.mu.Lock()
		maxPages := int(math.Ceil(float64(result.TotalCount) / float64(pageSize)))
		if i.maxPages == nil || maxPages <= *i.maxPages {
			i.maxPages = &maxPages
		}
		fmt.Println(page, *i.maxPages)
		i.mu.Unlock()
	}
}

func (i *Indexer) ProcessAffiliateFees(block *tmtypes.Block) {
	blockResult, err := i.HTTPClient.BlockResults(int(block.Height))
	if err != nil {
		i.errChan <- err
	}

	_, typedEvents, err := thorchain.ParseBlockEvents(blockResult.EndBlockEvents)
	if err != nil {
		panic(err)
	}

	for j := range blockResult.EndBlockEvents {
		affiliateFee := &AffiliateFee{
			BlockHash:   block.Hash().String(),
			BlockHeight: block.Height,
			Timestamp:   int(block.Header.Time.Unix()),
		}

		switch v := typedEvents[j].(type) {
		case *thorchain.EventOutbound:
			coinParts := strings.Fields(v.Coin)
			affiliateFee.TxID = v.InTxID
			affiliateFee.Address = v.To
			affiliateFee.Amount = coinParts[0]
			affiliateFee.Asset = coinParts[1]
		default:
			continue
		}

		if affiliateFee.Address == affiliateAddress {
			i.AffiliateFees = append(i.AffiliateFees, affiliateFee)
		}
	}
}
