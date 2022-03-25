// Package classification Cosmos Unchained API
//
// Provides access to cosmos chain data
//
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
	"github.com/rs/cors"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/websocket"
)

const (
	PORT                     = 3000
	GRACEFUL_SHUTDOWN        = 15 * time.Second
	WRITE_TIMEOUT            = 15 * time.Second
	READ_TIMEOUT             = 15 * time.Second
	IDLE_TIMEOUT             = 60 * time.Second
	MAX_PAGE_SIZE_TX_HISTORY = 100
)

var (
	logger   = log.WithoutFields()
	upgrader = ws.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
)

type API struct {
	handler *Handler
	manager *websocket.Manager
	server  *http.Server
}

func New(httpClient *cosmos.HTTPClient, grpcClient *cosmos.GRPCClient, wsClient *cosmos.WSClient, blockService *cosmos.BlockService, swaggerPath string) *API {
	r := mux.NewRouter()

	a := &API{
		handler: &Handler{
			httpClient:   httpClient,
			grpcClient:   grpcClient,
			wsClient:     wsClient,
			blockService: blockService,
		},
		manager: websocket.NewManager(),
		server: &http.Server{
			Addr:         fmt.Sprintf(":%d", PORT),
			WriteTimeout: WRITE_TIMEOUT,
			ReadTimeout:  READ_TIMEOUT,
			IdleTimeout:  IDLE_TIMEOUT,
			Handler:      cors.AllowAll().Handler(r),
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

	v1Gas := v1.PathPrefix("/gas").Subrouter()
	v1Gas.HandleFunc("/estimate", a.EstimateGas).Methods("POST")

	v1Validators := v1.PathPrefix("/validators").Subrouter()
	v1Validators.HandleFunc("", a.GetValidators).Methods("GET")
	v1Validators.HandleFunc("/{pubkey}", a.GetValidator).Methods("GET")

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

	a.handler.grpcClient.Close()
	a.handler.wsClient.Stop()
	if err := a.server.Shutdown(ctx); err != nil {
		logger.Errorf("error shutting down server: %+v", err)
	}
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
//   500: InternalServerError
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
//   200: TxHistory
//   400: BadRequestError
//   500: InternalServerError
func (a *API) TxHistory(w http.ResponseWriter, r *http.Request) {
	// pubkey validated by ValidatePubkey middleware
	pubkey := mux.Vars(r)["pubkey"]

	cursor := r.URL.Query().Get("cursor")

	pageSizeQ := r.URL.Query().Get("pageSize")
	if pageSizeQ == "" {
		pageSizeQ = "10"
	}

	pageSize, err := strconv.Atoi(pageSizeQ)
	if err != nil {
		api.HandleError(w, http.StatusBadRequest, err.Error())
		return
	}

	if pageSize > MAX_PAGE_SIZE_TX_HISTORY {
		api.HandleError(w, http.StatusBadRequest, fmt.Sprintf("page size max is %d", MAX_PAGE_SIZE_TX_HISTORY))
		return
	}

	if pageSize == 0 {
		api.HandleError(w, http.StatusBadRequest, "page size cannot be 0")
		return
	}

	txHistory, err := a.handler.GetTxHistory(pubkey, cursor, pageSize)
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
//   500: InternalServerError
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
// Get the estimated gas cost for a transaction
//
// responses:
//   200: GasAmount
//   400: BadRequestError
//   500: InternalServerError
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

// swagger:route Get /api/v1/validators v1 GetValidators
//
// Get the list of current validators
//
// responses:
//   200: Validators
//   500: InternalServerError
func (a *API) GetValidators(w http.ResponseWriter, r *http.Request) {
	validators, err := a.handler.GetValidators()
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	v := cosmos.Validators{
		Validators: validators,
	}

	api.HandleResponse(w, http.StatusOK, v)
}

// swagger:route Get /api/v1/validators/{pubkey} v1 GetValidator
//
// Get a specific validator
//
// responses:
//   200: Validator
//   500: InternalServerError
func (a *API) GetValidator(w http.ResponseWriter, r *http.Request) {
	pubkey, ok := mux.Vars(r)["pubkey"]
	if !ok || pubkey == "" {
		api.HandleError(w, http.StatusBadRequest, "pubkey required")
		return
	}

	if !cosmos.IsValidValidatorAddress(pubkey) {
		api.HandleError(w, http.StatusBadRequest, fmt.Sprintf("invalid pubkey: %s", pubkey))
		return
	}

	validator, err := a.handler.GetValidator(pubkey)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, validator)
}
