package cosmos

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/cosmos/cosmos-sdk/simapp/params"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	disttypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	ibctypes "github.com/cosmos/cosmos-sdk/x/ibc/applications/transfer/types"
	ibccoretypes "github.com/cosmos/cosmos-sdk/x/ibc/core/02-client/types"
	ibcchanneltypes "github.com/cosmos/cosmos-sdk/x/ibc/core/04-channel/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/pkg/tendermint/client"
)

// cursor stores state client side between paginated requests
type Cursor struct {
	LastBlockHeight     uint64 `json:"blockHeight"`
	LastRecipTxID       string `json:"lastRecipTxID"`
	LastSendTxID        string `json:"lastSendTxID"`
	TendermintSentPage  uint   `json:"tendermintSenderPage"`
	TendermintRecvdPage uint   `json:"tendermintReceiverPage"`
	TotalSends          uint64 `json:"totalSends"`
	TotalReceives       uint64 `json:"totalReceives"`
}

// primary history state struct
type txHistoryState struct {
	ctx              context.Context
	address          string
	pageSize         uint
	cursor           Cursor
	cursorSerialized string
	sends            []client.TxSearchResponseResultTxs
	recips           []client.TxSearchResponseResultTxs
	encodingConfig   *params.EncodingConfig
	tendermintClient *client.APIClient
}

type HistTxType int

const (
	histTxTypeSender = iota
	histTxTypeRecipient
)

const tendermintPageSize = 100

func Events(log string) []Event {
	logs, err := sdk.ParseABCILogs(log)
	if err != nil {
		logger.Error("failed to parse logs: %s", err)
		return nil
	}

	events := []Event{}
	for _, l := range logs {
		for _, e := range l.GetEvents() {
			attributes := []Attribute{}
			for _, a := range e.Attributes {
				attribute := Attribute{
					Key:   a.Key,
					Value: a.Value,
				}
				attributes = append(attributes, attribute)
			}

			event := Event{
				Type:       e.Type,
				Attributes: attributes,
			}
			events = append(events, event)
		}
	}

	return events
}

func Messages(msgs []sdk.Msg) []Message {
	messages := []Message{}

	coinToValue := func(c *sdk.Coin) Value {
		return Value{
			Amount: c.Amount.String(),
			Denom:  c.Denom,
		}
	}

	for _, msg := range msgs {
		switch v := msg.(type) {
		case *banktypes.MsgSend:
			message := Message{
				From:  v.FromAddress,
				To:    v.ToAddress,
				Type:  v.Type(),
				Value: coinToValue(&v.Amount[0]),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgDelegate:
			message := Message{
				From:  v.DelegatorAddress,
				Type:  v.Type(),
				Value: coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgUndelegate:
			message := Message{
				From:  v.DelegatorAddress,
				To:    v.ValidatorAddress,
				Type:  v.Type(),
				Value: coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *stakingtypes.MsgBeginRedelegate:
			message := Message{
				From:  v.DelegatorAddress,
				Type:  v.Type(),
				Value: coinToValue(&v.Amount),
			}
			messages = append(messages, message)
		case *disttypes.MsgWithdrawDelegatorReward:
			message := Message{
				From: v.ValidatorAddress,
				To:   v.DelegatorAddress,
				Type: v.Type(),
			}
			messages = append(messages, message)
		case *ibctypes.MsgTransfer:
			message := Message{
				From:  v.Sender,
				To:    v.Receiver,
				Type:  v.Type(),
				Value: coinToValue(&v.Token),
			}
			messages = append(messages, message)
		case *ibccoretypes.MsgUpdateClient:
			message := Message{
				From: v.Signer,
				Type: v.Type(),
			}
			messages = append(messages, message)
		case *ibcchanneltypes.MsgRecvPacket:
			message := Message{
				From: v.Signer,
				Type: v.Type(),
			}
			messages = append(messages, message)
		default:
			logger.Warnf("unsupported message type: %s, %T", v.Type(), v)
		}
	}

	return messages
}

// make a request for a page of tx history from the tendermint RPC endpoint
func (s *txHistoryState) tendermintHistoryRequest(txType HistTxType) (*client.TxSearchResponse, error) {
	var (
		query   string
		page    uint
		refetch bool
		res     client.TxSearchResponse
		httpRes *http.Response
		err     error
	)

	// assign query and current page by txtype (sender or recipient)
	switch txType {
	case histTxTypeSender:
		query = buildSentTxsQuery(s.address)
		page = s.cursor.TendermintSentPage
	case histTxTypeRecipient:
		query = buildRecvdTxsQuery(s.address)
		page = s.cursor.TendermintRecvdPage
	default:
		return nil, fmt.Errorf("invalid histTxType %d", txType)
	}

	// iterate until we get some results after uniquifying or run out of txs from tendermint
	for {
		start := time.Now().UnixMilli()
		res, httpRes, err = s.tendermintClient.InfoApi.TxSearch(s.ctx).
			Query(query).
			Page(int32(page)).
			PerPage(int32(tendermintPageSize)).
			OrderBy("\"desc\"").Execute()
		logger.Infof("type %d page %d query resolved in %dms: %s", txType, page, time.Now().UnixMilli()-start, query)

		if err != nil {
			logger.Errorf("error getting tx history: %s", err)
			return nil, errors.Wrap(err, "failed to get send transactions")
		}
		// failed requests resolve without error in many cases
		if httpRes.StatusCode < 200 || httpRes.StatusCode > 399 {
			return nil, errors.New(fmt.Sprintf("http status code %d", httpRes.StatusCode))
		}

		// if this is first page/no cursor w/ last block height we're done fetching
		if s.cursor.LastBlockHeight == 0 {
			break
		}

		// otherwise we need to iterate results skipping txs we've already seen on the current tendermint page
		filtered := make([]client.TxSearchResponseResultTxs, 0, len(res.Result.Txs))
		foundLastTx := false
		lastTxID := s.cursor.LastSendTxID
		if txType == histTxTypeRecipient {
			lastTxID = s.cursor.LastRecipTxID
		}

		for i, tx := range res.Result.Txs {
			if tx.Height == nil {
				break
			}
			txHeight, err := strconv.ParseUint(*tx.Height, 10, 64)
			if err != nil {
				logger.Errorf("error parsing tx height %s: %s", *tx.Height, err)
				break
			}
			// skip if height newer than last height from cursor
			if txHeight > s.cursor.LastBlockHeight {
				continue
			}
			// if equal to last height from cursor, skip until we find matching last tx
			if txHeight == s.cursor.LastBlockHeight {
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
		if !refetch {
			res.Result.Txs = filtered
			break
		}
		refetch = false
		page++
	}

	switch txType {
	case histTxTypeSender:
		s.cursor.TendermintSentPage = page
	case histTxTypeRecipient:
		s.cursor.TendermintRecvdPage = page
	default:
		return nil, fmt.Errorf("invalid histTxType %d", txType)
	}

	return &res, nil
}

func (c *txHistoryState) nextSenderTxHistoryPage() (*client.TxSearchResponse, error) {
	c.cursor.TendermintSentPage++
	res, err := c.tendermintHistoryRequest(histTxTypeSender)
	if err != nil {
		return nil, errors.Wrapf(err, "error getting tendermint sent tx history")
	}

	return res, nil
}

func (c *txHistoryState) nextRecipTxHistoryPage() (*client.TxSearchResponse, error) {
	c.cursor.TendermintRecvdPage++
	res, err := c.tendermintHistoryRequest(histTxTypeRecipient)
	if err != nil {
		return nil, errors.Wrapf(err, "error getting tendermint recipient tx history")
	}

	return res, nil
}

func buildSentTxsQuery(address string) string {
	queryTemplate := `"message.sender='%s'"`
	return fmt.Sprintf(queryTemplate, address)
}

func buildRecvdTxsQuery(address string) string {
	queryTemplate := `"transfer.recipient='%s'"`
	return fmt.Sprintf(queryTemplate, address)
}

// given 2 sets of tx history, remove duplicates from the second set (recipient txs)
func uniqueify(sender []client.TxSearchResponseResultTxs, recip []client.TxSearchResponseResultTxs) ([]client.TxSearchResponseResultTxs, []client.TxSearchResponseResultTxs) {
	m := make(map[string]bool, len(sender)+len(recip))
	filteredRecip := make([]client.TxSearchResponseResultTxs, 0, len(recip))
	for i := 0; i < len(sender); i++ {
		tx := sender[i]
		m[*tx.Hash] = true
	}
	for i := 0; i < len(recip); i++ {
		tx := recip[i]
		if _, ok := m[*tx.Hash]; !ok {
			m[*tx.Hash] = true
			filteredRecip = append(filteredRecip, tx)
		}
	}
	return sender, filteredRecip
}

func (c *Cursor) encode() *string {
	if bytes, err := json.Marshal(c); err != nil {
		logger.Errorf("error marshaling cursor from %#v: %s", c, err)
		return nil
	} else {
		encoded := base64.StdEncoding.EncodeToString(bytes)
		return &encoded
	}
}

func (c *Cursor) decode(b64 string) error {
	str, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return errors.Wrapf(err, "error decoding base64 cursor %s", b64)
	}

	if err := json.Unmarshal([]byte(str), c); err != nil {
		return errors.Wrapf(err, "error marshaling cursor from %#v", c)
	}
	return nil
}

// read tendermint tx history
func (s *txHistoryState) readTxHistory() (*TxHistory, error) {
	// if we have cursor, restore state
	if s.cursorSerialized != "" {
		if err := s.cursor.decode(s.cursorSerialized); err != nil {
			return nil, errors.Wrapf(err, "error decoding cursor %s", s.cursorSerialized)
		} else {
			// decrement by 1 so we start on last page we requested from tendermint
			if s.cursor.TendermintSentPage > 0 {
				s.cursor.TendermintSentPage--
			}
			if s.cursor.TendermintRecvdPage > 0 {
				s.cursor.TendermintRecvdPage--
			}
		}
	}

	// default pageSize to 10
	if s.pageSize == 0 {
		s.pageSize = 10
	}

	sentResult, err := s.nextSenderTxHistoryPage()
	if err != nil {
		return nil, errors.Wrapf(err, "error reading sent txs for %s", s.address)
	}
	total := sentResult.Result.TotalCount

	totalSends, err := strconv.ParseUint(total, 10, 64)
	if err != nil {
		return nil, errors.Wrapf(err, "error parsing send total %s", total)
	}
	s.cursor.TotalSends = totalSends

	recipResult, err := s.nextRecipTxHistoryPage()
	if err != nil {
		return nil, errors.Wrapf(err, "error reading transfer in txs for %s", s.address)
	}

	total = recipResult.Result.TotalCount
	totalRecips, err := strconv.ParseUint(total, 10, 64)
	if err != nil {
		return nil, errors.Wrapf(err, "error parsing send total %s", total)
	}

	s.cursor.TotalReceives = totalRecips
	logger.Infof("got %d sent and %d recvd txs for %s", len(sentResult.Result.Txs), len(recipResult.Result.Txs), s.address)

	txs := make([]Tx, 0, s.pageSize)

	var senderDone, recipDone bool
	s.sends, s.recips = uniqueify(sentResult.Result.Txs, recipResult.Result.Txs)

	for uint(len(txs)) < s.pageSize && (!senderDone || !recipDone) {
		logger.Infof("unique we have %d sent and %d recvd", len(s.sends), len(s.recips))

		// need to refill recvd bucket
		if len(s.recips) == 0 && !recipDone {
			_, recipDone, err = s.refill(histTxTypeRecipient)
			if err != nil {
				return nil, errors.Wrap(err, "error re-filling recips")
			}
		}

		// need to refill sent bucket
		if len(s.sends) == 0 && !senderDone {
			_, senderDone, err = s.refill(histTxTypeSender)
			if err != nil {
				return nil, errors.Wrap(err, "error re-filling sends")
			}
		}

		// get the first tx from each type
		var topOfSent, topOfRecvd uint64
		if len(s.sends) > 0 && s.sends[0].Height != nil {
			if topOfSent, err = strconv.ParseUint(*s.sends[0].Height, 10, 64); err != nil {
				return nil, errors.Wrapf(err, "failed to parse top sent height %s", *s.sends[0].Height)
			}
		}

		if len(s.recips) > 0 && s.recips[0].Height != nil {
			if topOfRecvd, err = strconv.ParseUint(*s.recips[0].Height, 10, 64); err != nil {
				return nil, errors.Wrapf(err, "failed to parse top recvd height %s", *s.recips[0].Height)
			}
		}

		// nothing on either we're done
		if topOfSent == 0 && topOfRecvd == 0 {
			break
		}
		logger.Infof("topOfSent: %d, topOfRecvd: %d", topOfSent, topOfRecvd)

		var next client.TxSearchResponseResultTxs
		// take tx with greatest (newest) height, defaulting to sender if equal
		if topOfSent >= topOfRecvd {
			next = s.sends[0]
			s.sends = s.sends[1:]
			s.cursor.LastSendTxID = *next.Hash
		} else {
			next = s.recips[0]
			s.recips = s.recips[1:]
			s.cursor.LastRecipTxID = *next.Hash
		}

		// decode tx to its components
		cosmosTx, signingTx, err := decodeTx(*next.Tx, s.encodingConfig)
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
		logger.Infof("collected %d total txs so far. have %d sends and %d recips on hand", len(txs), len(s.sends), len(s.recips))
	}

	var pageCursor string
	if !senderDone || !recipDone {
		oldestIncluded := txs[len(txs)-1]
		heightStr := *oldestIncluded.TendermintTx.Height
		blockHeight, err := strconv.ParseUint(heightStr, 10, 64)
		if err != nil {
			logger.Errorf("error parsing blockHeight %s: %s", err)
		} else {
			s.cursor.LastBlockHeight = blockHeight
			curs := s.cursor.encode()
			if curs != nil {
				pageCursor = *curs
			}
		}
	}

	txHistory := &TxHistory{
		Txs:    txs,
		Cursor: pageCursor,
	}

	return txHistory, nil
}

func (s *txHistoryState) refill(txType HistTxType) (filled bool, done bool, err error) {
	var (
		lastReadPage uint
		totalTxs     uint64
		nextPage     func() (*client.TxSearchResponse, error)
	)
	switch txType {
	case histTxTypeSender:
		lastReadPage = s.cursor.TendermintSentPage
		totalTxs = s.cursor.TotalSends
		nextPage = s.nextSenderTxHistoryPage
	case histTxTypeRecipient:
		lastReadPage = s.cursor.TendermintRecvdPage
		totalTxs = s.cursor.TotalReceives
		nextPage = s.nextRecipTxHistoryPage
	default:
		err = fmt.Errorf("invalid histTxType %d", txType)
		return
	}

	for !filled && !done {
		if uint64(lastReadPage*tendermintPageSize) >= totalTxs {
			done = true
			break
		}

		var result *client.TxSearchResponse
		result, err = nextPage()
		if err != nil {
			err = errors.Wrapf(err, "error reading next page of txs for %s", s.address)
			break
		}

		txs := result.Result.Txs
		switch txType {
		case histTxTypeSender:
			s.sends = txs
		case histTxTypeRecipient:
			s.recips = txs
		default:
			err = fmt.Errorf("invalid histTxType %d", txType)
			return
		}

		if len(txs) == 0 {
			done = true
		} else {
			sent, recvd := uniqueify(s.sends, s.recips)
			switch txType {
			case histTxTypeSender:
				if len(sent) > 0 {
					filled = true
				}
			case histTxTypeRecipient:
				if len(recvd) > 0 {
					filled = true
				}
			default:
				err = fmt.Errorf("invalid txType %d", txType)
			}
			if err == nil {
				s.sends = sent
				s.recips = recvd
			}
		}
	}
	return
}

func (c *HTTPClient) GetTxHistory(address string, pageCursor string, pageSize uint) (*TxHistory, error) {
	state := txHistoryState{ctx: c.ctx, address: address, pageSize: pageSize, cursorSerialized: pageCursor, tendermintClient: c.tendermintClient, encodingConfig: c.encoding}
	txHistory, err := state.readTxHistory()
	if err != nil {
		return nil, errors.Wrapf(err, "fail to get tx history for %s", address)
	}

	return txHistory, nil
}

func decodeTx(rawTx string, encodingConfig *params.EncodingConfig) (sdk.Tx, signing.Tx, error) {
	protoTx, err := base64.StdEncoding.DecodeString(rawTx)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error decoding transaction from base64")
	}

	sdkTx, err := encodingConfig.TxConfig.TxDecoder()(protoTx)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error decoding transaction from protobuf")
	}

	builder, err := encodingConfig.TxConfig.WrapTxBuilder(sdkTx)
	if err != nil {
		return nil, nil, errors.Wrapf(err, "error making transaction builder")
	}

	return sdkTx, builder.GetTx(), nil
}
