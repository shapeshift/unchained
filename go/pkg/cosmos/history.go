package cosmos

import (
	"github.com/pkg/errors"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
)

const STATIC_PAGE_SIZE int32 = 25

// TxState stores state for a specific query source
type TxState struct {
	hasMore bool
	lastID  string
	page    int
	query   string
	txs     []*coretypes.ResultTx
}

// History stores state for multiple query sources to complete a paginated request
type History struct {
	cursor   *Cursor
	pageSize int
	receive  *TxState
	send     *TxState
	client   *HTTPClient
}

func (h *History) doRequest(txState *TxState) (*coretypes.ResultTxSearch, error) {
	for {
		result, err := h.client.TxSearch(txState.query, txState.page, int(STATIC_PAGE_SIZE))
		if err != nil {
			return nil, errors.Wrap(err, "failed to do request")
		}

		// no txs returned, mark as no more transactions
		if len(result.Txs) == 0 {
			txState.hasMore = false
			return result, nil
		}

		// no cursor provided by client, return response
		if h.cursor.TxIndex == nil {
			return result, nil
		}

		result.Txs, err = h.filterByCursor(result.Txs)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to filter transactions by cursor")
		}

		// fetch the next page if no transactions exist after filtering
		if len(result.Txs) == 0 {
			txState.page++
			continue
		}

		return result, nil
	}
}

// filterByCursor will filter out any transactions that we have already returned to the client based on the state of the cursor
func (h *History) filterByCursor(txs []*coretypes.ResultTx) ([]*coretypes.ResultTx, error) {
	filtered := []*coretypes.ResultTx{}
	for _, tx := range txs {
		// do not include transaction if height is more recent than the last tx returned
		if int(tx.Height) > h.cursor.BlockHeight {
			continue
		}

		// do not include transaction if height is the same as the last tx returned
		// and the transaction id matches one of the last txids seen
		// or the transaction index is less than the last tx index
		if int(tx.Height) == h.cursor.BlockHeight {
			if tx.Hash.String() == h.cursor.SendTxID || tx.Hash.String() == h.cursor.ReceiveTxID {
				continue
			}
			if tx.Index <= *h.cursor.TxIndex {
				continue
			}
		}

		filtered = append(filtered, tx)
	}

	return filtered, nil
}

func (h *History) fetch() (*TxHistoryResponse, error) {
	res, err := h.doRequest(h.send)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get send tx history")
	}
	h.send.txs = res.Txs

	res, err = h.doRequest(h.receive)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get receive tx history")
	}
	h.receive.txs = res.Txs

	h.removeDuplicateTxs()

	// no transaction history detected
	if len(h.send.txs) == 0 && len(h.receive.txs) == 0 {
		return &TxHistoryResponse{}, nil
	}

	// splice together send and receive transactions in the correct order
	// until we either run out of transactions to return, or fill a full page response.
	txs := []*coretypes.ResultTx{}
	for len(txs) < h.pageSize {
		// fetch more send transactions if we have run out and more are available
		if len(h.send.txs) == 0 && h.send.hasMore {
			if err = h.fetchMore(h.send); err != nil {
				return nil, errors.Wrap(err, "failed to fetch more send txs")
			}
		}

		// fetch more receive transactions if we have run out and more are available
		if len(h.receive.txs) == 0 && h.receive.hasMore {
			if err := h.fetchMore(h.receive); err != nil {
				return nil, errors.Wrap(err, "failed to fetch more receive txs")
			}
		}

		// no more transaction history available
		if len(h.send.txs) == 0 && len(h.receive.txs) == 0 {
			break
		}

		sendHeight := getMostRecentHeight(h.send.txs)
		receiveHeight := getMostRecentHeight(h.receive.txs)

		// find the next most recent transaction and remove from the txs set
		var next *coretypes.ResultTx
		if sendHeight >= receiveHeight {
			next = h.send.txs[0]
			h.send.txs = h.send.txs[1:]
			h.send.lastID = next.Hash.String()
		} else {
			next = h.receive.txs[0]
			h.receive.txs = h.receive.txs[1:]
			h.receive.lastID = next.Hash.String()
		}

		txs = append(txs, next)
	}

	// no paginated data to return
	if len(txs) == 0 {
		return &TxHistoryResponse{}, nil
	}

	lastTx := txs[len(txs)-1]

	// set cursor state
	h.cursor.BlockHeight = int(lastTx.Height)
	h.cursor.TxIndex = &lastTx.Index
	h.cursor.SendPage = h.send.page
	h.cursor.ReceivePage = h.receive.page
	h.cursor.ReceiveTxID = h.receive.lastID
	h.cursor.SendTxID = h.send.lastID

	// encode cursor if there are more txs available to be fetched
	var cursor string
	if len(h.send.txs) > 0 || len(h.receive.txs) > 0 {
		cursor, err = h.cursor.encode()
		if err != nil {
			return nil, errors.Wrapf(err, "failed to encode cursor: %+v", h.cursor)
		}
	}

	txHistory := &TxHistoryResponse{
		Txs:    txs,
		Cursor: cursor,
	}

	return txHistory, nil
}

func (h *History) fetchMore(txState *TxState) error {
	txState.page++

	res, err := h.doRequest(txState)
	if err != nil {
		return errors.Wrapf(err, "failed to fetch more txs")
	}

	txState.txs = res.Txs

	h.removeDuplicateTxs()

	return nil
}

func (h *History) removeDuplicateTxs() {
	seenTxs := make(map[string]bool)

	sendTxs := []*coretypes.ResultTx{}
	for _, tx := range h.send.txs {
		if _, seen := seenTxs[tx.Hash.String()]; !seen {
			seenTxs[tx.Hash.String()] = true
			sendTxs = append(sendTxs, tx)
		}
	}
	h.send.txs = sendTxs

	receiveTxs := []*coretypes.ResultTx{}
	for _, tx := range h.receive.txs {
		if _, seen := seenTxs[tx.Hash.String()]; !seen {
			seenTxs[tx.Hash.String()] = true
			receiveTxs = append(receiveTxs, tx)
		}
	}
	h.receive.txs = receiveTxs
}

func getMostRecentHeight(txs []*coretypes.ResultTx) int {
	if len(txs) == 0 {
		return -2
	}

	return int(txs[0].Height)
}
