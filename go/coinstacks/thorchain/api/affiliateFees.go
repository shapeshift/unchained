package api

import (
	"context"
	"fmt"
	"math"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"

	abci "github.com/cometbft/cometbft/abci/types"
	cometbftjson "github.com/cometbft/cometbft/libs/json"
	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	cometbft "github.com/cometbft/cometbft/rpc/jsonrpc/client"
	"github.com/cometbft/cometbft/types"
	cometbfttypes "github.com/cometbft/cometbft/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/thorchain"
	"golang.org/x/sync/errgroup"
)

const (
	blockWorkers  = 10
	resultWorkers = 100
	pageSize      = 50
)

type AffiliateFeeIndexer struct {
	AffiliateAddresses []string
	AffiliateFees      []*AffiliateFee
	conf               cosmos.Config
	httpClients        []*cosmos.HTTPClient
	mu                 sync.Mutex
	pageChs            []chan int
	resultChs          []chan *coretypes.ResultBlockSearch
	wg                 sync.WaitGroup
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

func NewAffiliateFeeIndexer(conf cosmos.Config, httpClients []*cosmos.HTTPClient) *AffiliateFeeIndexer {
	affiliateAddresses := []string{"thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l", "thor1crs0y53jfg224mettqeg883e6ume49tllktg2s"}

	pageChs := make([]chan int, len(httpClients)*len(affiliateAddresses))
	for i := range pageChs {
		pageChs[i] = make(chan int)
	}

	resultChs := make([]chan *coretypes.ResultBlockSearch, len(httpClients)*len(affiliateAddresses))
	for i := range resultChs {
		resultChs[i] = make(chan *coretypes.ResultBlockSearch)
	}

	return &AffiliateFeeIndexer{
		AffiliateAddresses: affiliateAddresses,
		AffiliateFees:      []*AffiliateFee{},
		conf:               conf,
		httpClients:        httpClients,
		pageChs:            pageChs,
		resultChs:          resultChs,
	}
}

func (i *AffiliateFeeIndexer) Sync() error {
	start := time.Now()
	logger.Info("Started indexing affiliate fees")

	defer func() {
		for _, resultCh := range i.resultChs {
			close(resultCh)
		}
	}()

	if err := i.listen(); err != nil {
		return err
	}

	g := new(errgroup.Group)

	idx := 0
	for _, affiliateAddress := range i.AffiliateAddresses {
		affiliateAddress := affiliateAddress

		for _, httpClient := range i.httpClients {
			httpClient := httpClient

			resultCh := i.resultChs[idx]
			pageCh := i.pageChs[idx]

			idx++

			g.Go(func() error {
				for w := 0; w < resultWorkers; w++ {
					go func() {
						for result := range resultCh {
							for _, b := range result.Blocks {
								block := b.Block
								i.handleBlock(httpClient, block, affiliateAddress)
							}
						}
					}()
				}

				result, err := httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, affiliateAddress), 1, pageSize)
				if err != nil {
					return err
				}

				maxPages := int(math.Ceil(float64(result.TotalCount) / float64(pageSize)))
				resultCh <- result

				i.wg.Add(blockWorkers)
				for w := 0; w < blockWorkers; w++ {
					go i.fetchBlocks(httpClient, affiliateAddress, pageCh, resultCh)
				}

				go func() {
					page := 2
					for {
						if page > maxPages {
							close(pageCh)
							break
						}
						pageCh <- page
						page++
					}
				}()

				i.wg.Wait()

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

func (i *AffiliateFeeIndexer) listen() error {
	wsURL, err := url.Parse(i.conf.WSURL)
	if err != nil {
		return errors.Wrapf(err, "failed to parse WSURL: %s", i.conf.WSURL)
	}

	client, err := cometbft.NewWS(wsURL.String(), "/websocket")
	if err != nil {
		return errors.Wrapf(err, "failed to create websocket client")
	}

	// use default dialer
	client.Dialer = net.Dial

	cometbft.MaxReconnectAttempts(10)(client)
	cometbft.OnReconnect(func() {
		logger.Info("OnReconnect triggered: resubscribing")
		_ = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
	})(client)

	if err := client.Start(); err != nil {
		return errors.Wrap(err, "failed to start websocket client")
	}

	if err = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String()); err != nil {
		return errors.Wrap(err, "failed to subscribe to newBlocks")
	}

	go func(client *cometbft.WSClient) {
		for r := range client.ResponsesCh {
			if r.Error != nil {
				if r.Error.Code == -32000 {
					err := client.UnsubscribeAll(context.Background())
					if err != nil {
						logger.Error(errors.Wrap(err, "failed to unsubscribe from all subscriptions"))
					}

					err = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
					if err != nil {
						logger.Error(errors.Wrap(err, "failed to subscribe to newBlocks"))
					}

					continue
				}

				logger.Error(r.Error.Error())
				continue
			}

			result := &coretypes.ResultEvent{}
			if err := cometbftjson.Unmarshal(r.Result, result); err != nil {
				logger.Errorf("failed to unmarshal tx message: %v", err)
				continue
			}

			if result.Data != nil {
				switch result.Data.(type) {
				case types.EventDataNewBlockHeader:
					go i.handleNewBlockHeader(result.Data.(types.EventDataNewBlockHeader))
				default:
					fmt.Printf("unsupported result type: %T", result.Data)
				}
			}
		}
	}(client)

	return nil
}

func (i *AffiliateFeeIndexer) fetchBlocks(httpClient *cosmos.HTTPClient, affiliateAddress string, pageCh <-chan int, resultCh chan<- *coretypes.ResultBlockSearch) {
	defer i.wg.Done()

	for page := range pageCh {
		result, err := httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, affiliateAddress), page, pageSize)
		if err != nil {
			logger.Panicf("failed to fetch blocks for page: %d: %+v", page, err)
		}

		resultCh <- result
	}
}

func (i *AffiliateFeeIndexer) handleBlock(httpClient *cosmos.HTTPClient, block *cometbfttypes.Block, affiliateAddress string) {
	blockResult, err := httpClient.BlockResults(int(block.Height))
	if err != nil {
		logger.Panicf("failed to handle block: %d: %+v", block.Height, err)
	}

	b := &thorchain.ResultBlock{
		Block: block,
	}

	i.processAffiliateFees(b, blockResult.FinalizeBlockEvents, []string{affiliateAddress})
}

func (i *AffiliateFeeIndexer) handleNewBlockHeader(newBlockHeader types.EventDataNewBlockHeader) {
	//b := &thorchain.NewBlockHeader{
	//	EventDataNewBlockHeader: newBlockHeader,
	//}

	//i.processAffiliateFees(b, newBlockHeader.ResultEndBlock.Events, i.AffiliateAddresses)
}

func (i *AffiliateFeeIndexer) processAffiliateFees(block thorchain.Block, blockEvents []abci.Event, affiliateAddresses []string) {
	_, typedEvents, err := thorchain.ParseBlockEvents(blockEvents)
	if err != nil {
		logger.Panicf("failed to parse block events for block: %d: %+v", block.Height(), err)
	}

	for _, event := range typedEvents {
		affiliateFee := &AffiliateFee{
			BlockHash:   block.Hash(),
			BlockHeight: block.Height(),
			Timestamp:   block.Timestamp(),
		}

		switch v := event.(type) {
		case *thorchain.EventOutbound:
			coinParts := strings.Fields(v.Coin)
			affiliateFee.TxID = v.InTxID
			affiliateFee.Address = v.To
			affiliateFee.Amount = coinParts[0]
			affiliateFee.Asset = coinParts[1]
		default:
			continue
		}

		for _, affiliateAddress := range affiliateAddresses {
			if affiliateFee.Address == affiliateAddress {
				i.mu.Lock()
				i.AffiliateFees = append(i.AffiliateFees, affiliateFee)
				i.mu.Unlock()
				break
			}
		}
	}
}
