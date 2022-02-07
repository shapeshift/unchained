// Package classification Cosmos Unchained API
//
// Provides access to cosmos chain data
//
// Version: 5.0.0
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
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	ws "github.com/gorilla/websocket"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/internal/log"
	"github.com/shapeshift/go-unchained/pkg/api"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
	"github.com/shapeshift/go-unchained/pkg/websocket"
)

const (
	gracefulShutdown = 15 * time.Second
)

var logger = log.WithoutFields()

var upgrader = ws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type API struct {
	handler  *Handler
	mananger *websocket.Manager
	wsClient *websocket.Client
	server   *http.Server
}

func New(httpClient *cosmos.HTTPClient, grpcClient *cosmos.GRPCClient, wsClient *websocket.Client, swaggerPath string) *API {
	r := mux.NewRouter()

	s := &http.Server{
		Addr:         ":3000",
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
		IdleTimeout:  60 * time.Second,
		Handler:      r,
	}

	a := &API{
		handler: &Handler{
			httpClient: httpClient,
			grpcClient: grpcClient,
		},
		mananger: websocket.NewManager(),
		server:   s,
		wsClient: wsClient,
	}

	// compile check to ensure Handler implements BaseAPI
	var _ api.BaseAPI = a.handler

	r.Use(api.Scheme)
	r.Use(api.Logger)

	r.HandleFunc("/", a.Root).Methods("GET")

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		handleResponse(w, http.StatusOK, map[string]string{"status": "up", "coinstack": "cosmos", "connections": strconv.Itoa(a.mananger.ConnectionCount())})
	}).Methods("GET")

	r.HandleFunc("/swagger", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.FromSlash(swaggerPath))
	}).Methods("GET")
	r.PathPrefix("/docs/").Handler(http.StripPrefix("/docs/", http.FileServer(http.Dir("./static/swaggerui"))))

	v1 := r.PathPrefix("/api/v1").Subrouter()
	v1.HandleFunc("/info", a.Info).Methods("GET")
	v1.HandleFunc("/send", a.SendTx).Methods("POST")

	v1Account := v1.PathPrefix("/account").Subrouter()
	v1Account.Use(validatePubkey)
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

	go a.mananger.Start()

	if err := a.server.ListenAndServe(); err != nil {
		errChan <- errors.Wrap(err, "error serving application")
	}
}

func (a *API) Shutdown() {
	ctx, cancel := context.WithTimeout(context.Background(), gracefulShutdown)
	defer cancel()

	a.handler.grpcClient.Close()
	//a.wsClient.Stop()
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
// Subscribe Example:
//
// Unsubscribe Example:
//
// responses:
//   200:
func (a *API) Websocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		handleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	c := websocket.NewConnection(conn, a.wsClient, a.mananger)
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
		handleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	handleResponse(w, http.StatusOK, info)
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
		handleError(w, http.StatusBadRequest, "pubkey required")
		return
	}

	account, err := a.handler.GetAccount(pubkey)
	if err != nil {
		handleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	handleResponse(w, http.StatusOK, account)
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
		handleError(w, http.StatusBadRequest, "pubkey required")
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
		handleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	handleResponse(w, http.StatusOK, txHistory)
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
		handleError(w, http.StatusBadRequest, "invalid post body")
		return
	}

	txHash, err := a.handler.SendTx(body.Hex)
	if err != nil {
		handleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	handleResponse(w, http.StatusOK, txHash)
}

func handleResponse(w http.ResponseWriter, status int, res interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(res)
}

func handleError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	var e interface{}

	switch status {
	case http.StatusBadRequest:
		e = api.BadRequestError{Error: message}
	case http.StatusInternalServerError:
		e = api.InternalServerError{Message: message}
	default:
		e = api.Error{Message: message}
	}

	json.NewEncoder(w).Encode(e)
}
