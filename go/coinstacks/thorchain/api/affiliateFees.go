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
	"github.com/shapeshift/unchained/coinstacks/thorchain"
	"github.com/shapeshift/unchained/pkg/cosmos"
	abci "github.com/tendermint/tendermint/abci/types"
	tendermintjson "github.com/tendermint/tendermint/libs/json"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	tendermint "github.com/tendermint/tendermint/rpc/jsonrpc/client"
	"github.com/tendermint/tendermint/types"
	tmtypes "github.com/tendermint/tendermint/types"
	"golang.org/x/sync/errgroup"
)

const (
	blockWorkers     = 10
	resultWorkers    = 100
	pageSize         = 25
	affiliateAddress = "thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l"
)

type AffiliateFeeIndexer struct {
	AffiliateFees []*AffiliateFee
	conf          cosmos.Config
	httpClient    *cosmos.HTTPClient
	mu            sync.Mutex
	pageCh        chan int
	resultCh      chan *coretypes.ResultBlockSearch
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
	logger.Info("Started indexing affiliate fees")
	start := time.Now()

	defer close(i.resultCh)

	if err := i.listen(); err != nil {
		return err
	}

	go func() {
		for j := 0; j < resultWorkers; j++ {
			go func() {
				for result := range i.resultCh {
					for _, b := range result.Blocks {
						block := b.Block
						if err := i.handleBlock(block); err != nil {
							logger.Error(err)
						}
					}
				}
			}()
		}
	}()

	result, err := i.httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, "thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l"), 1, pageSize)
	if err != nil {
		return err
	}

	maxPages := int(math.Ceil(float64(result.TotalCount) / float64(pageSize)))
	i.resultCh <- result

	g := new(errgroup.Group)
	for w := 0; w <= blockWorkers; w++ {
		g.Go(func() error {
			return i.fetchBlocks()
		})
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

	if err := g.Wait(); err != nil {
		return err
	}

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

func (i *AffiliateFeeIndexer) fetchBlocks() error {
	for page := range i.pageCh {
		result, err := i.httpClient.BlockSearch(fmt.Sprintf(`"outbound.to='%s'"`, "thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l"), page, pageSize)
		if err != nil {
			return errors.Wrapf(err, "failed to fetch blocks for page: %d", page)
		}

		i.resultCh <- result
	}

	return nil
}

func (i *AffiliateFeeIndexer) handleBlock(block *tmtypes.Block) error {
	blockResult, err := i.httpClient.BlockResults(int(block.Height))
	if err != nil {
		return errors.Wrapf(err, "failed to handle block: %v", block.Height)
	}

	b := &ResultBlock{
		Block: block,
	}

	if err := i.processAffiliateFees(b, blockResult.EndBlockEvents); err != nil {
		return errors.Wrap(err, "failed to process affiliate fees")
	}

	return nil
}

func (i *AffiliateFeeIndexer) handleNewBlockHeader(newBlockHeader types.EventDataNewBlockHeader) {
	b := &NewBlockHeader{
		EventDataNewBlockHeader: newBlockHeader,
	}

	if err := i.processAffiliateFees(b, newBlockHeader.ResultEndBlock.Events); err != nil {
		logger.Panicf("failed to process affiliate fees: %+v", err)
	}
}

func (i *AffiliateFeeIndexer) processAffiliateFees(block Block, endBlockEvents []abci.Event) error {
	_, typedEvents, err := thorchain.ParseBlockEvents(endBlockEvents)
	if err != nil {
		return errors.Wrap(err, "failed to parse block events")
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

	return nil
}
