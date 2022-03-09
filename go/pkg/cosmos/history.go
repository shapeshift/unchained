package cosmos

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/cosmos/cosmos-sdk/simapp/params"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/tendermint/client"
)

const STATIC_PAGE_SIZE int32 = 25

// TxState stores state for a specific query source
type TxState struct {
	hasMore bool
	lastID  string
	page    int
	query   string
	txs     []client.TxSearchResponseResultTxs
}

// History stores state for multiple query sources to complete a paginated request
type History struct {
	ctx              context.Context
	cursor           *Cursor
	encoding         *params.EncodingConfig
	pageSize         int
	receive          *TxState
	send             *TxState
	tendermintClient *client.APIClient
}

func (h *History) doRequest(txState *TxState) (*client.TxSearchResponse, error) {
	for {
		res, httpRes, err := h.tendermintClient.InfoApi.TxSearch(h.ctx).PerPage(STATIC_PAGE_SIZE).OrderBy("\"desc\"").Query(txState.query).Page(int32(txState.page)).Execute()
		if err != nil {
			var e struct {
				Error struct {
					Data string `json:"data"`
				} `json:"error"`
			}

			json.NewDecoder(httpRes.Body).Decode(&e)

			// error is returned if page is out of range past page 1, mark as no more transactions
			if strings.Contains(e.Error.Data, "page should be within") {
				txState.hasMore = false
				return &client.TxSearchResponse{}, nil
			}

			return nil, errors.Wrapf(err, "failed to get tx history: %s", e.Error.Data)
		}

		// no txs returned, mark as no more transactions
		if len(res.Result.Txs) == 0 {
			txState.hasMore = false
			return res, nil
		}

		// no cursor provided by client, return response
		if h.cursor.TxIndex == nil {
			return res, nil
		}

		res.Result.Txs, err = h.filterByCursor(res.Result.Txs)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to filter transactions by cursor")
		}

		// fetch the next page if no transactions exist after filtering
		if len(res.Result.Txs) == 0 {
			txState.page++
			continue
		}

		return res, nil
	}
}

// filterByCursor will filter out any transactions that we have already returned to the client based on the state of the cursor
func (h *History) filterByCursor(txs []client.TxSearchResponseResultTxs) ([]client.TxSearchResponseResultTxs, error) {
	filtered := []client.TxSearchResponseResultTxs{}
	for _, tx := range txs {
		txHeight, err := strconv.Atoi(*tx.Height)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to convert tx height %s", *tx.Height)
		}

		// do not include transaction if height is more recent than the last tx returned
		if txHeight > h.cursor.BlockHeight {
			continue
		}

		// do not include transaction if height is the same as the last tx returned
		// and the transaction id matches one of the last txids seen
		// or the transaction index is less than the last tx index
		if txHeight == h.cursor.BlockHeight {
			// TODO: test if txids are necessary or if txIndex is sufficent
			if *tx.Hash == h.cursor.SendTxID || *tx.Hash == h.cursor.ReceiveTxID {
				continue
			}
			if *tx.Index <= *h.cursor.TxIndex {
				continue
			}
		}

		filtered = append(filtered, tx)
	}

	return filtered, nil
}

func (h *History) fetch() (*TxHistory, error) {
	res, err := h.doRequest(h.send)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get send tx history")
	}
	h.send.txs = res.Result.Txs

	res, err = h.doRequest(h.receive)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get receive tx history")
	}
	h.receive.txs = res.Result.Txs

	h.removeDuplicateTxs()

	// no transaction history detected
	if len(h.send.txs) == 0 && len(h.receive.txs) == 0 {
		return &TxHistory{}, nil
	}

	// splice together send and receive transactions in the correct order
	// until we either run out of transactions to return, or fill a full page response.
	txs := []Tx{}
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

		sendHeight, err := getMostRecentHeight(h.send.txs)
		if err != nil {
			return nil, errors.Wrap(err, "failed to get most recent send tx height")
		}

		receiveHeight, err := getMostRecentHeight(h.receive.txs)
		if err != nil {
			return nil, errors.Wrap(err, "failed to get most recent receive tx height")
		}

		// find the next most recent transaction and remove from the txs set
		var next client.TxSearchResponseResultTxs
		if sendHeight >= receiveHeight {
			next = h.send.txs[0]
			h.send.txs = h.send.txs[1:]
			h.send.lastID = *next.Hash
		} else {
			next = h.receive.txs[0]
			h.receive.txs = h.receive.txs[1:]
			h.receive.lastID = *next.Hash
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

	// no paginated data to return
	if len(txs) == 0 {
		return &TxHistory{}, nil
	}

	lastTx := txs[len(txs)-1]

	blockHeight, err := strconv.Atoi(*lastTx.TendermintTx.Height)
	if err != nil {
		logger.Errorf("error parsing blockHeight %s: %s", err)
	}

	// set cursor state
	h.cursor.BlockHeight = blockHeight
	h.cursor.TxIndex = lastTx.TendermintTx.Index
	h.cursor.SendPage = h.send.page
	h.cursor.ReceivePage = h.receive.page
	h.cursor.ReceiveTxID = h.receive.lastID
	h.cursor.SendTxID = h.send.lastID

	// encode cursor if there are more txs available to be fetched
	var cursor string
	// TODO: test to ensure no cursor returned on final tx
	if len(h.send.txs) > 0 || len(h.receive.txs) > 0 {
		cursor, err = h.cursor.encode()
		if err != nil {
			return nil, errors.Wrapf(err, "failed to encode cursor: %+v", h.cursor)
		}
	}

	txHistory := &TxHistory{
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

	txState.txs = res.Result.Txs

	h.removeDuplicateTxs()

	return nil
}

func (h *History) removeDuplicateTxs() {
	seenTxs := make(map[string]bool)

	sendTxs := []client.TxSearchResponseResultTxs{}
	for _, tx := range h.send.txs {
		if _, seen := seenTxs[*tx.Hash]; !seen {
			seenTxs[*tx.Hash] = true
			sendTxs = append(sendTxs, tx)
		}
	}
	h.send.txs = sendTxs

	receiveTxs := []client.TxSearchResponseResultTxs{}
	for _, tx := range h.receive.txs {
		if _, seen := seenTxs[*tx.Hash]; !seen {
			seenTxs[*tx.Hash] = true
			receiveTxs = append(receiveTxs, tx)
		}
	}
	h.receive.txs = receiveTxs
}

func getMostRecentHeight(txs []client.TxSearchResponseResultTxs) (int, error) {
	// TODO: test no txs case to ensure it falls through correctly
	if len(txs) == 0 {
		return -2, nil
	}

	tx := txs[0]

	// no tx height implies mempool transaction
	if tx.Height == nil {
		return -1, nil
	}

	return strconv.Atoi(*tx.Height)
}
