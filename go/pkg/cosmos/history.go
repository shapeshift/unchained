package cosmos

import (
	"github.com/pkg/errors"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
	"golang.org/x/sync/errgroup"
)

type RequestFn = func(string, int, int) (*coretypes.ResultTxSearch, error)

// TxState stores state for a specific query source
type TxState struct {
	hasMore bool                  // indicates if the source has more tx history available
	lastID  string                // tracks the last txid returned
	page    int                   // current page
	query   string                // query string for tendermint search
	request RequestFn             // request http function
	txs     []*coretypes.ResultTx // txs returned
}

// History stores state for multiple query sources to complete a paginated request
type History struct {
	cursor   *Cursor
	pageSize int
	state    map[string]*TxState
	client   *HTTPClient
}

func (h *History) doRequest(txState *TxState) (*coretypes.ResultTxSearch, error) {
	for {
		result, err := txState.request(txState.query, txState.page, h.pageSize)
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

		// TODO: only filter on initial fetch
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
		if tx.Height > h.cursor.BlockHeight {
			continue
		}

		// do not include transaction if height is the same as the last tx returned
		// and the transaction id matches one of the last txids seen
		// or the transaction index is less than the last tx index
		if tx.Height == h.cursor.BlockHeight {
			found := false
			for _, s := range h.cursor.State {
				if tx.Hash.String() == s.TxID {
					found = true
					break
				}
			}
			if found {
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

func (h *History) get() (*TxHistoryResponse, error) {
	// fetch starting transaction history based on current state of the cursor
	if err := h.fetch(false); err != nil {
		return nil, errors.Wrap(err, "failed to get tx history")
	}

	if !h.hasTxHistory() {
		return &TxHistoryResponse{}, nil
	}

	// splice together transactions in the correct order until we either run out of transactions to return or fill a full page response.
	txs := []*coretypes.ResultTx{}
	for len(txs) < h.pageSize {
		// fetch more transaction history if we have run out and more are available
		if err := h.fetch(true); err != nil {
			return nil, errors.Wrap(err, "failed to get additional tx history")
		}

		if !h.hasTxHistory() {
			break
		}

		txs = append(txs, h.getNextTx())
	}

	// no paginated data to return
	if len(txs) == 0 {
		return &TxHistoryResponse{}, nil
	}

	lastTx := txs[len(txs)-1]

	// set cursor state
	h.cursor.BlockHeight = lastTx.Height
	h.cursor.TxIndex = &lastTx.Index

	for source, s := range h.state {
		h.cursor.State[source].Page = s.page
		h.cursor.State[source].TxID = s.lastID
	}

	txHistory := &TxHistoryResponse{
		Txs: txs,
	}

	// encode cursor if there are more txs available to be fetched
	if h.hasTxHistory() {
		cursor, err := h.cursor.encode()
		if err != nil {
			return nil, errors.Wrapf(err, "failed to encode cursor: %+v", h.cursor)
		}

		txHistory.Cursor = cursor
	}

	return txHistory, nil
}

func (h *History) fetch(more bool) error {
	g := new(errgroup.Group)

	for k, s := range h.state {
		state := s
		source := k

		// check if we should fetch more transactions
		if more {
			if len(state.txs) > 0 || !state.hasMore {
				continue
			}

			state.page++
		}

		g.Go(func() error {
			res, err := h.doRequest(state)
			if err != nil {
				return errors.Wrapf(err, "failed to fetch %s", source)
			}

			state.txs = res.Txs

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return errors.WithStack(err)
	}

	h.removeDuplicateTxs()

	return nil
}

func (h *History) removeDuplicateTxs() {
	seenTxs := make(map[string]bool)

	for _, s := range h.state {
		txs := []*coretypes.ResultTx{}

		for _, tx := range s.txs {
			if _, seen := seenTxs[tx.Hash.String()]; !seen {
				seenTxs[tx.Hash.String()] = true
				txs = append(txs, tx)
			}
		}

		s.txs = txs
	}
}

func (h *History) hasTxHistory() bool {
	for _, s := range h.state {
		if len(s.txs) > 0 {
			return true
		}
	}

	return false
}

// getNextTx returns the next most recent transaction and removes it from corresponding source txs set
func (h *History) getNextTx() *coretypes.ResultTx {
	var state *TxState
	var nextHeight int

	for _, s := range h.state {
		height := getMostRecentHeight(s.txs)
		if height > nextHeight {
			nextHeight = height
			state = s
		}
	}

	tx := state.txs[0]
	state.txs = state.txs[1:]
	state.lastID = tx.Hash.String()

	return tx
}

func getMostRecentHeight(txs []*coretypes.ResultTx) int {
	if len(txs) == 0 {
		return -2
	}

	return int(txs[0].Height)
}
