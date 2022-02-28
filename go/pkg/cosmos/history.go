package cosmos

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/cosmos/cosmos-sdk/simapp/params"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/tendermint/client"
)

type TxType int

const (
	Send = iota
	Receive
)

func (t TxType) String() string {
	switch t {
	case Send:
		return "send"
	case Receive:
		return "receive"
	default:
		return fmt.Sprintf("unknown (%d)", t)
	}
}

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

func (h *History) String() string {
	return fmt.Sprintf(`{address: %s, pageSize: %d, sendTxs: %d, hasMoreSendTxs: %t, receiveTxs: %d, hasMoreReceiveTxs: %t} %+v`,
		h.address, h.pageSize, len(h.sendTxs), h.hasMoreSendTxs, len(h.receiveTxs), h.hasMoreReceiveTxs, h.cursor)
}

func (h *History) doRequest(txType TxType) (*client.TxSearchResponse, error) {
	for {
		req := h.tendermintClient.InfoApi.TxSearch(h.ctx).PerPage(int32(h.pageSize)).OrderBy("\"desc\"")

		switch txType {
		case Send:
			res, httpRes, err := req.Query(fmt.Sprintf(`"message.sender='%s'"`, h.address)).Page(int32(h.cursor.SendPage)).Execute()
			if err != nil {
				var e struct {
					Error struct {
						Data string `json:"data"`
					} `json:"error"`
				}

				json.NewDecoder(httpRes.Body).Decode(&e)

				// error is returned if page is out of range past page 1
				if strings.Contains(e.Error.Data, "page should be within") {
					h.hasMoreSendTxs = false
					return &client.TxSearchResponse{}, nil
				}

				return nil, errors.Wrapf(err, "failed to get tx history: %s", e.Error.Data)
			}

			// no txs returned, mark as no more transactions
			if len(res.Result.Txs) == 0 {
				h.hasMoreSendTxs = false
				return res, nil
			}

			// no cursor provided by client, return response
			if h.cursor.LastSendTxIndex == nil {
				return res, nil
			}

			res.Result.Txs, err = h.filterByCursor(res.Result.Txs, h.cursor.LastSendTxIndex)
			if err != nil {
				return nil, errors.Wrapf(err, "failed to filter transactions by cursor")
			}

			// fetch the next page if no transactions exist after filtering
			if len(res.Result.Txs) == 0 {
				h.cursor.SendPage++
				continue
			}

			return res, nil
		case Receive:
			res, httpRes, err := req.Query(fmt.Sprintf(`"transfer.recipient='%s'"`, h.address)).Page(int32(h.cursor.ReceivePage)).Execute()
			if err != nil {
				var e struct {
					Error struct {
						Data string `json:"data"`
					} `json:"error"`
				}

				json.NewDecoder(httpRes.Body).Decode(&e)

				// error is returned if page is out of range past page 1
				if strings.Contains(e.Error.Data, "page should be within") {
					h.hasMoreReceiveTxs = false
					return &client.TxSearchResponse{}, nil
				}

				return nil, errors.Wrapf(err, "failed to get tx history: %s", e.Error.Data)
			}

			// no txs returned, mark as no more transactions
			if len(res.Result.Txs) == 0 {
				h.hasMoreSendTxs = false
				return &client.TxSearchResponse{}, nil
			}

			// no cursor provided by client, return response
			if h.cursor.LastReceiveTxIndex == nil {
				return res, nil
			}

			res.Result.Txs, err = h.filterByCursor(res.Result.Txs, h.cursor.LastReceiveTxIndex)
			if err != nil {
				return nil, errors.Wrapf(err, "failed to filter transactions by cursor")
			}

			// fetch the next page if no transactions exist after filtering
			if len(res.Result.Txs) == 0 {
				h.cursor.ReceivePage++
				continue
			}

			return res, nil
		default:
			return nil, errors.Errorf("invalid TxType: %s", txType)
		}
	}
}

// filterByCursor will filter out any transactions that we have already returned to the client based on the state of the cursor
func (h *History) filterByCursor(txs []client.TxSearchResponseResultTxs, lastTxIndex *int32) ([]client.TxSearchResponseResultTxs, error) {
	filtered := []client.TxSearchResponseResultTxs{}
	for _, tx := range txs {
		txHeight, err := strconv.Atoi(*tx.Height)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to convert tx height %s", *tx.Height)
		}

		// do not include transaction if height is more recent than the last tx returned
		if txHeight > h.cursor.LastBlockHeight {
			continue
		}

		// do not include transaction if same height but tx index is more recent than the last tx returned
		if txHeight == h.cursor.LastBlockHeight && *tx.Index <= *lastTxIndex {
			continue
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

	res, err = h.doRequest(Receive)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get receive tx history")
	}
	h.receiveTxs = res.Result.Txs

	h.removeDuplicateTxs()

	// no transaction history detected
	if len(h.sendTxs) == 0 && len(h.receiveTxs) == 0 {
		return &TxHistory{}, nil
	}

	// splice together send and receive transactions in the correct order
	// until we either run out of transactions to return, or fill a full page response.
	txs := []Tx{}
	for len(txs) < h.pageSize {
		// fetch more send transactions if we have run out and more are available
		if len(h.sendTxs) == 0 && h.hasMoreSendTxs {
			if err = h.fetchMore(Send); err != nil {
				return nil, errors.Wrap(err, "failed to fetch more send txs")
			}
		}

		// fetch more receive transactions if we have run out and more are available
		if len(h.receiveTxs) == 0 && h.hasMoreReceiveTxs {
			if err := h.fetchMore(Receive); err != nil {
				return nil, errors.Wrap(err, "failed to fetch more receive txs")
			}
		}

		// no more transaction history available
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

		// find the next most recent transaction and remove from the txs set
		var next client.TxSearchResponseResultTxs
		if sendHeight >= receiveHeight {
			next = h.sendTxs[0]
			h.sendTxs = h.sendTxs[1:]
			h.cursor.LastSendTxIndex = next.Index
		} else {
			next = h.receiveTxs[0]
			h.receiveTxs = h.receiveTxs[1:]
			h.cursor.LastReceiveTxIndex = next.Index
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

	// encode cursor if there are more txs available to be fetched
	var cursor string
	if len(h.sendTxs) > 0 || len(h.receiveTxs) > 0 {
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

func (h *History) fetchMore(txType TxType) error {
	switch txType {
	case Send:
		h.cursor.SendPage++
		res, err := h.doRequest(txType)
		if err != nil {
			return errors.Wrapf(err, "error reading next page of txs for %s", h.address)
		}

		h.sendTxs = res.Result.Txs
		h.removeDuplicateTxs()
	case Receive:
		h.cursor.ReceivePage++
		res, err := h.doRequest(txType)
		if err != nil {
			return errors.Wrapf(err, "error reading next page of txs for %s", h.address)
		}

		h.receiveTxs = res.Result.Txs
		h.removeDuplicateTxs()
	default:
		return errors.Errorf("invalid TxType: %s", txType)
	}

	return nil
}

func (h *History) removeDuplicateTxs() {
	seenTxs := make(map[string]bool)

	sendTxs := []client.TxSearchResponseResultTxs{}
	for _, tx := range h.sendTxs {
		if _, seen := seenTxs[*tx.Hash]; !seen {
			seenTxs[*tx.Hash] = true
			sendTxs = append(sendTxs, tx)
		}
	}
	h.sendTxs = sendTxs

	receiveTxs := []client.TxSearchResponseResultTxs{}
	for _, tx := range h.receiveTxs {
		if _, seen := seenTxs[*tx.Hash]; !seen {
			seenTxs[*tx.Hash] = true
			receiveTxs = append(receiveTxs, tx)
		}
	}
	h.receiveTxs = receiveTxs
}

func getMostRecentHeight(txs []client.TxSearchResponseResultTxs) (int, error) {
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
