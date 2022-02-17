// Package classification Thorchain Unchained API
//
// Provides access to thorchain chain data
//
// Version: 5.1.1
// License: MIT http://opensource.org/licenses/MIT
//
// Consumes:
// - application/json
//
// Produces:
// - application/json
//
// swagger:meta
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	ws "github.com/gorilla/websocket"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/websocket"
)

const (
	PORT              = 3000
	GRACEFUL_SHUTDOWN = 15 * time.Second
	WRITE_TIMEOUT     = 15 * time.Second
	READ_TIMEOUT      = 15 * time.Second
	IDLE_TIMEOUT      = 60 * time.Second
)

var (
	logger   = log.WithoutFields()
	upgrader = ws.Upgrader{ReadBufferSize: 1024, WriteBufferSize: 1024}
)

type API struct {
	handler *Handler
	manager *websocket.Manager
	server  *http.Server
}

func New(httpClient *cosmos.HTTPClient, wsClient *cosmos.WSClient, swaggerPath string) *API {
	r := mux.NewRouter()

	a := &API{
		handler: &Handler{
			httpClient: httpClient,
			wsClient:   wsClient,
		},
		manager: websocket.NewManager(),
		server: &http.Server{
			Addr:         fmt.Sprintf(":%d", PORT),
			WriteTimeout: WRITE_TIMEOUT,
			ReadTimeout:  READ_TIMEOUT,
			IdleTimeout:  IDLE_TIMEOUT,
			Handler:      r,
		},
	}

	// compile check to ensure Handler implements BaseAPI
	var _ api.BaseAPI = a.handler

	r.Use(api.Scheme)
	r.Use(api.Logger)

	r.HandleFunc("/", a.Root).Methods("GET")

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		api.HandleResponse(w, http.StatusOK, map[string]string{"status": "up", "coinstack": "cosmos", "connections": strconv.Itoa(a.manager.ConnectionCount())})
	}).Methods("GET")

	r.HandleFunc("/swagger", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.FromSlash(swaggerPath))
	}).Methods("GET")

	r.PathPrefix("/docs/").Handler(http.StripPrefix("/docs/", http.FileServer(http.Dir("./static/swaggerui"))))

	v1 := r.PathPrefix("/api/v1").Subrouter()
	v1.HandleFunc("/info", a.Info).Methods("GET")
	v1.HandleFunc("/send", a.SendTx).Methods("POST")

	v1Account := v1.PathPrefix("/account").Subrouter()
	v1Account.Use(cosmos.ValidatePubkey)
	v1Account.HandleFunc("/{pubkey}", a.Account).Methods("GET")
	v1Account.HandleFunc("/{pubkey}/txs", a.TxHistory).Methods("GET")

	// docs redirect paths
	r.HandleFunc("/docs", docsRedirect).Methods("GET")

	http.Handle("/", r)

	return a
}

func docsRedirect(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/docs/", http.StatusFound)
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

	a.handler.wsClient.Stop()
	a.server.Shutdown(ctx)
}

func (a *API) Root(w http.ResponseWriter, r *http.Request) {
	if r.URL.Scheme == "ws" || r.URL.Scheme == "wss" {
		a.Websocket(w, r)
		return
	}

	docsRedirect(w, r)
}

// swagger:route GET / Websocket Websocket
//
// Subscribe to pending and confirmed transactions.
//
// responses:
//   200:
func (a *API) Websocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	c := websocket.NewConnection(conn, a.handler.wsClient, a.manager)
	c.Start()
}

// swagger:route GET /api/v1/info v1 GetInfo
//
// Get information about the running coinstack.
//
// responses:
//   200: Info
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
//   200: Account
//   400: BadRequestError
//   422: ValidationError
//   500: InternalServerError
func (a *API) Account(w http.ResponseWriter, r *http.Request) {
	pubkey, ok := mux.Vars(r)["pubkey"]
	if !ok || pubkey == "" {
		api.HandleError(w, http.StatusBadRequest, "pubkey required")
		return
	}

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
//   200: TxHistory
//   400: BadRequestError
//   422: ValidationError
//   500: InternalServerError
func (a *API) TxHistory(w http.ResponseWriter, r *http.Request) {
	pubkey, ok := mux.Vars(r)["pubkey"]
	if !ok || pubkey == "" {
		api.HandleError(w, http.StatusBadRequest, "pubkey required")
		return
	}

	page, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil {
		page = 1
	}

	pageSize, err := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if err != nil {
		pageSize = 25
	}

	txHistory, err := a.handler.GetTxHistory(pubkey, page, pageSize)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, txHistory)
}

// swagger:route POST /api/v1/send v1 SendTx
//
// Sends raw transaction to be broadcast to the node.
//
// responses:
//   200: TransactionHash
//   400: BadRequestError
//   422: ValidationError
//   500: InternalServerError
func (a *API) SendTx(w http.ResponseWriter, r *http.Request) {
	body := &api.TxBody{}

	err := json.NewDecoder(r.Body).Decode(body)
	if err != nil {
		api.HandleError(w, http.StatusBadRequest, "invalid post body")
		return
	}

	txHash, err := a.handler.SendTx(body.Hex)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, txHash)
}
