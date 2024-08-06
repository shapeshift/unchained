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

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/thorchain"
	abci "github.com/tendermint/tendermint/abci/types"
	tendermintjson "github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	tendermint "github.com/tendermint/tendermint/rpc/jsonrpc/client"
	"github.com/tendermint/tendermint/types"
	tmtypes "github.com/tendermint/tendermint/types"
)

const (
	blockWorkers     = 10
	resultWorkers    = 100
	pageSize         = 50
	affiliateAddress = "thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l"
)

type AffiliateFeeIndexer struct {
	AffiliateFees []*AffiliateFee
	conf          cosmos.Config
	httpClient    *cosmos.HTTPClient
	mu            sync.Mutex
	pageCh        chan int
	resultCh      chan *coretypes.ResultBlockSearch
	wg            sync.WaitGroup
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

func NewAffiliateFeeIndexer(conf cosmos.Config, httpClient *cosmos.HTTPClient) *AffiliateFeeIndexer {
	return &AffiliateFeeIndexer{
		AffiliateFees: []*AffiliateFee{},
		conf:          conf,
		httpClient:    httpClient,
		pageCh:        make(chan int),
		resultCh:      make(chan *coretypes.ResultBlockSearch),
	}
}

func (i *AffiliateFeeIndexer) Sync() error {
	start := time.Now()
	logger.Info("Started indexing affiliate fees")

	defer close(i.resultCh)

	if err := i.listen(); err != nil {
		return err
	}

	for w := 0; w < resultWorkers; w++ {
		go func() {
			for result := range i.resultCh {
				for _, b := range result.Blocks {
					block := b.Block
					i.handleBlock(block)
				}
			}
		}()
	}

	result, err := i.httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, "thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l"), 1, pageSize)
	if err != nil {
		return err
	}

	maxPages := int(math.Ceil(float64(result.TotalCount) / float64(pageSize)))
	i.resultCh <- result

	i.wg.Add(blockWorkers)
	for w := 0; w < blockWorkers; w++ {
		go i.fetchBlocks()
	}

	go func() {
		page := 2
		for {
			if page > maxPages {
				close(i.pageCh)
				break
			}
			i.pageCh <- page
			page++
		}
	}()

	i.wg.Wait()

	logger.Infof("Finished indexing affiliate fees (%s)", time.Since(start))

	return nil
}

func (i *AffiliateFeeIndexer) listen() error {
	wsURL, err := url.Parse(i.conf.WSURL)
	if err != nil {
		return errors.Wrapf(err, "failed to parse WSURL: %s", i.conf.WSURL)
	}

	client, err := tendermint.NewWS(wsURL.String(), "/websocket")
	if err != nil {
		return errors.Wrapf(err, "failed to create websocket client")
	}

	// use default dialer
	client.Dialer = net.Dial

	tendermint.MaxReconnectAttempts(10)(client)
	tendermint.OnReconnect(func() {
		logger.Info("OnReconnect triggered: resubscribing")
		_ = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String())
	})(client)

	if err := client.Start(); err != nil {
		return errors.Wrap(err, "failed to start websocket client")
	}

	if err = client.Subscribe(context.Background(), types.EventQueryNewBlockHeader.String()); err != nil {
		return errors.Wrap(err, "failed to subscribe to newBlocks")
	}

	go func(client *tendermint.WSClient) {
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
			if err := tendermintjson.Unmarshal(r.Result, result); err != nil {
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

func (i *AffiliateFeeIndexer) fetchBlocks() {
	defer i.wg.Done()

	for page := range i.pageCh {
		result, err := i.httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, "thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l"), page, pageSize)
		if err != nil {
			logger.Panicf("failed to fetch blocks for page: %d: %+v", page, err)
		}

		i.resultCh <- result
	}
}

func (i *AffiliateFeeIndexer) handleBlock(block *tmtypes.Block) {
	blockResult, err := i.httpClient.BlockResults(int(block.Height))
	if err != nil {
		logger.Panicf("failed to handle block: %d: %+v", block.Height, err)
	}

	b := &thorchain.ResultBlock{
		Block: block,
	}

	i.processAffiliateFees(b, blockResult.EndBlockEvents)
}

func (i *AffiliateFeeIndexer) handleNewBlockHeader(newBlockHeader types.EventDataNewBlockHeader) {
	b := &thorchain.NewBlockHeader{
		EventDataNewBlockHeader: newBlockHeader,
	}

	i.processAffiliateFees(b, newBlockHeader.ResultEndBlock.Events)
}

func (i *AffiliateFeeIndexer) processAffiliateFees(block thorchain.Block, endBlockEvents []abci.Event) {
	_, typedEvents, err := thorchain.ParseBlockEvents(endBlockEvents)
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

		if affiliateFee.Address == affiliateAddress {
			i.mu.Lock()
			i.AffiliateFees = append(i.AffiliateFees, affiliateFee)
			i.mu.Unlock()
		}
	}
}
