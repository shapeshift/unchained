package cosmos

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	ws "github.com/gorilla/websocket"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/websocket"
)

const (
	GRACEFUL_SHUTDOWN        = 15 * time.Second
	MAX_PAGE_SIZE_TX_HISTORY = 100
)

var (
	upgrader = ws.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
)

type API struct {
	handler RouteHandler
	manager *websocket.Manager
	server  *http.Server
}

func New(handler RouteHandler, manager *websocket.Manager, server *http.Server) *API {
	a := &API{
		handler: handler,
		manager: manager,
		server:  server,
	}

	return a
}

func (a *API) Serve(errChan chan<- error) {
	logger.Info("serving application")

	if err := a.handler.StartWebsocket(); err != nil {
		errChan <- errors.Wrap(err, "error starting websocket")
	}

	go a.manager.Start()

	if err := a.server.ListenAndServe(); err != nil {
		errChan <- errors.Wrap(err, "error serving application")
	}
}

func (a *API) Shutdown() {
	ctx, cancel := context.WithTimeout(context.Background(), GRACEFUL_SHUTDOWN)
	defer cancel()

	a.handler.StopWebsocket()

	if err := a.server.Shutdown(ctx); err != nil {
		logger.Errorf("error shutting down server: %+v", err)
	}
}

func (a *API) Root(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Upgrade") == "websocket" {
		a.Websocket(w, r)
		return
	}

	api.DocsRedirect(w, r)
}

func (a *API) validatePagingParams(w http.ResponseWriter, r *http.Request) (string, int) {
	cursor := r.URL.Query().Get("cursor")

	pageSizeQ := r.URL.Query().Get("pageSize")
	if pageSizeQ == "" {
		pageSizeQ = "10"
	}

	pageSize, err := strconv.Atoi(pageSizeQ)
	if err != nil {
		api.HandleError(w, http.StatusBadRequest, err.Error())
	}

	if pageSize > MAX_PAGE_SIZE_TX_HISTORY {
		api.HandleError(w, http.StatusBadRequest, fmt.Sprintf("page size max is %d", MAX_PAGE_SIZE_TX_HISTORY))
	}

	if pageSize == 0 {
		api.HandleError(w, http.StatusBadRequest, "page size cannot be 0")
	}

	return cursor, pageSize
}

// swagger:route GET / Websocket Websocket
//
// Subscribe to pending and confirmed transactions.
//
// responses:
//
//	200:
func (a *API) Websocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	a.handler.NewWebsocketConnection(conn, a.manager)
}

// swagger:route GET /api/v1/info v1 GetInfo
//
// Get information about the running coinstack.
//
// responses:
//
//	200: Info
func (a *API) Info(w http.ResponseWriter, r *http.Request) {
	info, err := a.handler.GetInfo()
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, info)
}

// swagger:route GET /api/v1/account/{pubkey} v1 GetAccount
//
// Get account details.
//
// responses:
//
//	200: Account
//	400: BadRequestError
//	500: InternalServerError
func (a *API) Account(w http.ResponseWriter, r *http.Request) {
	// pubkey validated by ValidatePubkey middleware
	pubkey := mux.Vars(r)["pubkey"]

	account, err := a.handler.GetAccount(pubkey)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, account)
}

// swagger:route GET /api/v1/account/{pubkey}/txs v1 GetTxHistory
//
// Get paginated transaction history.
//
// responses:
//
//	200: TxHistory
//	400: BadRequestError
//	500: InternalServerError
func (a *API) TxHistory(w http.ResponseWriter, r *http.Request) {
	// pubkey validated by ValidatePubkey middleware
	pubkey := mux.Vars(r)["pubkey"]
	cursor, pageSize := a.validatePagingParams(w, r)

	txHistory, err := a.handler.GetTxHistory(pubkey, cursor, pageSize)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, txHistory)
}

// swagger:route GET /api/v1/validators/{pubkey}/txs v1 ValidatorTxHistory
//
// Get paginated transaction history for a validator.
//
// responses:
//
//	200: TxHistory
//	400: BadRequestError
//	500: InternalServerError
func (a *API) ValidatorTxHistory(w http.ResponseWriter, r *http.Request) {
	validatorAddr := mux.Vars(r)["pubkey"]
	cursor, pageSize := a.validatePagingParams(w, r)
	println(validatorAddr, cursor, pageSize)
	txHistory, err := a.handler.GetTxHistory(validatorAddr, cursor, pageSize)

	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, txHistory)
}

// swagger:route GET /api/v1/tx/{txid} v1 GetTx
//
// # Get transaction details
//
// responses:
//
//	200: Tx
//	400: BadRequestError
//	500: InternalServerError
func (a *API) Tx(w http.ResponseWriter, r *http.Request) {
	txid, ok := mux.Vars(r)["txid"]
	if !ok || txid == "" {
		api.HandleError(w, http.StatusBadRequest, "txid required")
		return
	}

	tx, err := a.handler.GetTx(txid)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, tx)
}

// swagger:route POST /api/v1/send v1 SendTx
//
// Sends raw transaction to be broadcast to the node.
//
// responses:
//
//	200: TransactionHash
//	400: BadRequestError
//	500: InternalServerError
func (a *API) SendTx(w http.ResponseWriter, r *http.Request) {
	body := &api.TxBody{}

	err := json.NewDecoder(r.Body).Decode(body)
	if err != nil {
		api.HandleError(w, http.StatusBadRequest, "invalid post body")
		return
	}

	txHash, err := a.handler.SendTx(body.RawTx)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, txHash)
}

// swagger:route POST /api/v1/gas/estimate v1 EstimateGas
//
// Get the estimated gas cost for a transaction.
//
// responses:
//
//	200: TransactionHash
//	400: BadRequestError
//	500: InternalServerError
func (a *API) EstimateGas(w http.ResponseWriter, r *http.Request) {
	body := &api.TxBody{}

	err := json.NewDecoder(r.Body).Decode(body)
	if err != nil {
		api.HandleError(w, http.StatusBadRequest, "invalid post body")
		return
	}

	estimatedGas, err := a.handler.EstimateGas(body.RawTx)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, estimatedGas)
}
