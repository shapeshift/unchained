package cosmos

import (
	"fmt"

	coretypes "github.com/cometbft/cometbft/rpc/core/types"
	"github.com/pkg/errors"
	"golang.org/x/sync/errgroup"
)

type RequestFn = func(string, int, int) ([]HistoryTx, error)

// TxState stores state for a specific query source
type TxState struct {
	hasMore  bool        // indicates if the source has more tx history available
	lastTxID string      // tracks the last txid returned
	page     int         // current page
	query    string      // query string for tendermint search
	request  RequestFn   // request http function
	txs      []HistoryTx // txs returned
}

func NewTxState(hasMore bool, query string, request RequestFn) *TxState {
	return &TxState{
		hasMore: hasMore,
		query:   query,
		request: request,
	}
}

func TxHistorySources(client *HTTPClient, pubkey string, formatTx func(*coretypes.ResultTx) (*Tx, error)) map[string]*TxState {
	request := func(query string, page int, pageSize int) ([]HistoryTx, error) {
		result, err := client.TxSearch(query, page, pageSize)
		if err != nil {
			return nil, errors.WithStack(err)
		}

		txs := []HistoryTx{}
		for _, tx := range result.Txs {
			txs = append(txs, &ResultTx{ResultTx: tx, formatTx: formatTx})
		}

		return txs, nil
	}

	return map[string]*TxState{
		"send":    NewTxState(true, fmt.Sprintf(`"message.sender='%s'"`, pubkey), request),
		"receive": NewTxState(true, fmt.Sprintf(`"transfer.recipient='%s'"`, pubkey), request),
	}
}

func ValidatorTxHistorySources(client *HTTPClient, pubkey string, formatTx func(*coretypes.ResultTx) (*Tx, error)) map[string]*TxState {
	request := func(query string, page int, pageSize int) ([]HistoryTx, error) {
		result, err := client.TxSearch(query, page, pageSize)
		if err != nil {
			return nil, errors.WithStack(err)
		}

		txs := []HistoryTx{}
		for _, tx := range result.Txs {
			txs = append(txs, &ResultTx{ResultTx: tx, formatTx: formatTx})
		}

		return txs, nil
	}

	return map[string]*TxState{
		"delegate":   NewTxState(true, fmt.Sprintf(`"delegate.validator='%s'"`, pubkey), request),
		"undelegate": NewTxState(true, fmt.Sprintf(`"unbond.validator='%s'"`, pubkey), request),
	}
}

// History stores state for multiple query sources to complete a paginated request
type History struct {
	cursor   *Cursor
	pageSize int
	state    map[string]*TxState
	client   *HTTPClient
}

func (h *History) doRequest(txState *TxState) ([]HistoryTx, error) {
	for {
		txs, err := txState.request(txState.query, txState.page, h.pageSize)
		if err != nil {
			return nil, errors.Wrap(err, "failed to do request")
		}

		// no txs returned, mark as no more transactions
		if len(txs) == 0 {
			txState.hasMore = false
			return txs, nil
		}

		// no cursor provided by client, return response
		if h.cursor.TxIndex == nil {
			return txs, nil
		}

		// TODO: only filter on initial fetch
		txs, err = h.filterByCursor(txs)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to filter transactions by cursor")
		}

		// fetch the next page if no transactions exist after filtering
		if len(txs) == 0 {
			txState.page++
			continue
		}

		return txs, nil
	}
}

// filterByCursor will filter out any transactions that we have already returned to the client based on the state of the cursor
func (h *History) filterByCursor(txs []HistoryTx) ([]HistoryTx, error) {
	filtered := []HistoryTx{}
	for _, tx := range txs {
		// do not include transaction if height is more recent than the last tx returned
		if tx.GetHeight() > h.cursor.BlockHeight {
			continue
		}

		// do not include transaction if height is the same as the last tx returned
		// and the transaction id matches one of the last txids seen
		// or the transaction index is less than the last tx index
		if tx.GetHeight() == h.cursor.BlockHeight {
			found := false
			for _, s := range h.cursor.State {
				if tx.GetTxID() == s.TxID {
					found = true
					break
				}
			}
			if found {
				continue
			}
			if tx.GetIndex() <= *h.cursor.TxIndex {
				continue
			}
		}

		filtered = append(filtered, tx)
	}

	return filtered, nil
}

func (h *History) get() (*TxHistoryResponse, error) {
	txs := []Tx{}

	// fetch starting transaction history based on current state of the cursor
	if err := h.fetch(false); err != nil {
		return nil, errors.Wrap(err, "failed to get tx history")
	}

	if !h.hasTxHistory() {
		return &TxHistoryResponse{Txs: txs}, nil
	}

	// splice together transactions in the correct order until we either run out of transactions to return or fill a full page response.
	for len(txs) < h.pageSize {
		// fetch more transaction history if we have run out and more are available
		if err := h.fetch(true); err != nil {
			return nil, errors.Wrap(err, "failed to get additional tx history")
		}

		if !h.hasTxHistory() {
			break
		}

		tx, err := h.getNextTx()
		if err != nil {
			return nil, errors.Wrap(err, "failed to get next tx")
		}

		txs = append(txs, *tx)
	}

	// no paginated data to return
	if len(txs) == 0 {
		return &TxHistoryResponse{Txs: txs}, nil
	}

	lastTx := txs[len(txs)-1]

	// set cursor state
	h.cursor.BlockHeight = int64(lastTx.BlockHeight)
	h.cursor.TxIndex = &lastTx.Index
	for source, s := range h.state {
		h.cursor.State[source].Page = s.page
		h.cursor.State[source].TxID = s.lastTxID
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
			txs, err := h.doRequest(state)
			if err != nil {
				return errors.Wrapf(err, "failed to fetch %s", source)
			}

			state.txs = txs

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return errors.WithStack(err)
	}

	return nil
}

func (h *History) hasTxHistory() bool {
	for _, s := range h.state {
		if len(s.txs) > 0 {
			return true
		}
	}

	return false
}

// getNextTx formats and returns the next most recent transaction, removing it from corresponding source txs set
func (h *History) getNextTx() (*Tx, error) {
	var state *TxState
	var nextHeight int

	for _, s := range h.state {
		height := getMostRecentHeight(s.txs)
		if height > nextHeight {
			nextHeight = height
			state = s
		}
	}

	nextTx := state.txs[0]

	tx, err := nextTx.FormatTx()
	if err != nil {
		return nil, errors.Wrapf(err, "failed to format transaction: %s", nextTx.GetTxID())
	}

	state.txs = state.txs[1:]
	state.lastTxID = tx.TxID

	return tx, nil
}

func getMostRecentHeight(txs []HistoryTx) int {
	if len(txs) == 0 {
		return -2
	}

	return int(txs[0].GetHeight())
}
