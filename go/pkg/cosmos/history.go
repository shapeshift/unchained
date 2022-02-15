package cosmos

import (
	"context"
	"fmt"
	"strconv"

	"github.com/cosmos/cosmos-sdk/simapp/params"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/pkg/tendermint/client"
)

const PAGE_SIZE = 100

type TxType int

const (
	Send = iota
	Receive
)

// History stores state to complete the request
type History struct {
	ctx               context.Context
	address           string
	pageSize          int
	cursor            Cursor
	sendTxs           []client.TxSearchResponseResultTxs
	hasMoreSendTxs    bool
	receiveTxs        []client.TxSearchResponseResultTxs
	hasMoreReceiveTxs bool
	encoding          *params.EncodingConfig
	tendermintClient  *client.APIClient
}

func (h *History) doRequest(txType TxType) (*client.TxSearchResponse, error) {
	for {
		req := h.tendermintClient.InfoApi.TxSearch(h.ctx).PerPage(PAGE_SIZE).OrderBy("\"desc\"")

		switch txType {
		case Send:
			res, httpRes, err := req.Query(fmt.Sprintf("message.sender='%s'", h.address)).Page(int32(h.cursor.SendPage)).Execute()
			if err != nil {
				return nil, errors.Wrap(err, "failed to get tx history")
			}

			// failed requests resolve without error in many cases
			if httpRes.StatusCode < 200 || httpRes.StatusCode > 399 {
				return nil, errors.Errorf("failed to get tx history with status code: %d", httpRes.StatusCode)
			}

			if h.cursor.LastBlockHeight == -1 {
				return &res, nil
			}

			h.filterByCursor(res.Result.Txs, h.cursor.LastSendTxID)

			h.cursor.SendPage++
		case Receive:
			res, httpRes, err := req.Query(fmt.Sprintf("transfer.recipient='%s'", h.address)).Page(int32(h.cursor.ReceivePage)).Execute()
			if err != nil {
				return nil, errors.Wrap(err, "failed to get tx history")
			}

			// failed requests resolve without error in many cases
			if httpRes.StatusCode < 200 || httpRes.StatusCode > 399 {
				return nil, errors.Errorf("failed to get tx history with status code: %d", httpRes.StatusCode)
			}

			if h.cursor.LastBlockHeight == -1 {
				return &res, nil
			}

			h.filterByCursor(res.Result.Txs, h.cursor.LastReceiveTxID)

			h.cursor.ReceivePage++
		default:
			return nil, fmt.Errorf("invalid histTxType %d", txType)
		}
	}

	return &res, nil
}

func (h *History) filterByCursor(txs []client.TxSearchResponseResultTxs, lastTxID string) ([]client.TxSearchResponseResultTxs, error) {
	foundLastTx := false

	filtered := []client.TxSearchResponseResultTxs{}
	for i, tx := range txs {
		if tx.Height == nil {
			logger.Errorf("no height for tx: %s", *tx.Hash)
			break
		}

		txHeight, err := strconv.Atoi(*tx.Height)
		if err != nil {
			logger.Errorf("error parsing tx height %s: %s", *tx.Height, err)
			break
		}

		// skip if height newer than last height from cursor
		if txHeight > h.cursor.LastBlockHeight {
			continue
		}

		// if equal to last height from cursor, skip until we find matching last tx
		if txHeight == h.cursor.LastBlockHeight {
			if *tx.Hash == lastTxID {
				foundLastTx = true
				// found as last tx in results, need to fetch next page
				if i == len(res.Result.Txs)-1 {
					refetch = true
				}
				continue
			}
			if !foundLastTx {
				continue
			}
		}

		filtered = append(filtered, tx)
	}

	return filtered, nil
}

func (h *History) fetch() (*TxHistory, error) {
	res, err := h.doRequest(Send)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get send tx history")
	}

	h.sendTxs = res.Result.Txs

	h.cursor.TotalSends, err = strconv.Atoi(res.Result.TotalCount)
	if err != nil {
		return nil, errors.Wrapf(err, "error parsing send total %s", res.Result.TotalCount)
	}

	res, err = h.doRequest(Receive)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get receive tx history")
	}

	h.receiveTxs = res.Result.Txs

	h.cursor.TotalReceives, err = strconv.Atoi(res.Result.TotalCount)
	if err != nil {
		return nil, errors.Wrapf(err, "error parsing receive total %s", res.Result.TotalCount)
	}

	h.removeDuplicateTxs()

	txs := []Tx{}
	for len(txs) < h.pageSize && (h.hasMoreSendTxs || h.hasMoreReceiveTxs) {
		// fetch more send transactions if we run out but there are still more available
		if h.hasMoreSendTxs && len(h.sendTxs) == 0 {
			if err = h.fetchMore(Send); err != nil {
				return nil, errors.Wrap(err, "failed to fetch more send txs")
			}
		}

		// fetch more receive transactions if we run out but there are still more available
		if h.hasMoreReceiveTxs && len(h.receiveTxs) == 0 {
			if err := h.fetchMore(Receive); err != nil {
				return nil, errors.Wrap(err, "failed to fetch more receive txs")
			}
		}

		if len(h.sendTxs) == 0 && len(h.receiveTxs) == 0 {
			break
		}

		sendHeight, err := getMostRecentHeight(h.sendTxs)
		if err != nil {
			return nil, errors.Wrap(err, "failed to get most recent send tx height")
		}

		receiveHeight, err := getMostRecentHeight(h.receiveTxs)
		if err != nil {
			return nil, errors.Wrap(err, "failed to get most recent receive tx height")
		}

		// take tx with greatest (newest) height, defaulting to sender if equal
		var next client.TxSearchResponseResultTxs
		if sendHeight >= receiveHeight {
			next = h.sendTxs[0]
			h.sendTxs = h.sendTxs[1:]
			h.cursor.LastSendTxID = *next.Hash
		} else {
			next = h.receiveTxs[0]
			h.receiveTxs = h.receiveTxs[1:]
			h.cursor.LastReceiveTxID = *next.Hash
		}

		cosmosTx, signingTx, err := DecodeTx(*h.encoding, *next.Tx)
		if err != nil {
			logger.Errorf("failed to decode tx: %s: %s", *next.Hash, err.Error())
			continue
		}

		tx := Tx{
			TendermintTx: next,
			CosmosTx:     cosmosTx,
			SigningTx:    signingTx,
		}

		txs = append(txs, tx)
	}

	lastBlockHeight, err := strconv.Atoi(*txs[len(txs)-1].TendermintTx.Height)
	if err != nil {
		logger.Errorf("error parsing blockHeight %s: %s", err)
	}

	h.cursor.LastBlockHeight = lastBlockHeight
	cursor, err := h.cursor.encode()
	if err != nil {
	}

	txHistory := &TxHistory{
		Txs:    txs,
		Cursor: cursor,
	}

	return txHistory, nil
}

func (h *History) fetchMore(txType TxType) error {
	switch txType {
	case Send:
		// check if the current page fetched would have included the remaining send txs
		if h.cursor.SendPage*PAGE_SIZE >= h.cursor.TotalSends {
			h.hasMoreSendTxs = false
			return nil
		}

		// fetch the next page
		h.cursor.SendPage++
		res, err := h.doRequest(txType)
		if err != nil {
			return errors.Wrapf(err, "error reading next page of txs for %s", h.address)
		}

		h.sendTxs = res.Result.Txs
		h.removeDuplicateTxs()
	case Receive:
		// check if the current page fetched would have included the remaining send txs
		if h.cursor.ReceivePage*PAGE_SIZE >= h.cursor.TotalReceives {
			h.hasMoreReceiveTxs = false
			return nil
		}

		// fetch the next page
		h.cursor.ReceivePage++
		res, err := h.doRequest(txType)
		if err != nil {
			return errors.Wrapf(err, "error reading next page of txs for %s", h.address)
		}

		h.receiveTxs = res.Result.Txs
		h.removeDuplicateTxs()
	default:
		return errors.Errorf("invalid TxType: %d", txType)
	}

	return nil
}

func (h *History) removeDuplicateTxs() {
	sendTxs := make(map[string]bool)
	for _, tx := range h.sendTxs {
		sendTxs[*tx.Hash] = true
	}

	receiveTxs := []client.TxSearchResponseResultTxs{}
	for _, tx := range h.receiveTxs {
		if _, ok := sendTxs[*tx.Hash]; !ok {
			receiveTxs = append(receiveTxs, tx)
		}
	}

	h.receiveTxs = receiveTxs
}

func getMostRecentHeight(txs []client.TxSearchResponseResultTxs) (int, error) {
	if len(txs) == 0 {
		return 0, nil
	}

	tx := txs[0]

	if tx.Height == nil {
		// TODO: how to handle nil height
		return 0, nil
	}

	return strconv.Atoi(*tx.Height)
}
