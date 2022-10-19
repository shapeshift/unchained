// Package classification Cosmos Unchained API
//
// Provides access to cosmos chain data.
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
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gorilla/mux"
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

var logger = log.WithoutFields()

type API struct {
	*cosmos.API
	handler *Handler
}

func New(httpClient *cosmos.HTTPClient, grpcClient *cosmos.GRPCClient, wsClient *cosmos.WSClient, blockService *cosmos.BlockService, swaggerPath string) *API {
	router := mux.NewRouter()

	handler := &Handler{
		Handler: &cosmos.Handler{
			HTTPClient:   httpClient,
			GRPCClient:   grpcClient,
			WSClient:     wsClient,
			BlockService: blockService,
			Denom:        "uatom",
		},
	}

	manager := websocket.NewManager()

	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", PORT),
		WriteTimeout: WRITE_TIMEOUT,
		ReadTimeout:  READ_TIMEOUT,
		IdleTimeout:  IDLE_TIMEOUT,
		Handler:      cors.AllowAll().Handler(router),
	}

	apiRef := &API{
		API:     cosmos.New(handler, manager, server),
		handler: handler,
	}

	// compile check to ensure Handler implements necessary interfaces
	var _ api.BaseAPI = handler
	var _ cosmos.CoinSpecificHandler = handler

	// runtime check to ensure Handler implements CoinSpecific functionality
	if err := handler.ValidateCoinSpecific(handler); err != nil {
		logger.Panicf("%+v", err)
	}

	router.Use(api.Scheme)
	router.Use(api.Logger)

	router.HandleFunc("/", apiRef.Root).Methods("GET")

	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		api.HandleResponse(w, http.StatusOK, map[string]string{"status": "up", "coinstack": "cosmos", "connections": strconv.Itoa(manager.ConnectionCount())})
	}).Methods("GET")

	router.HandleFunc("/swagger", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.FromSlash(swaggerPath))
	}).Methods("GET")

	router.PathPrefix("/docs/").Handler(http.StripPrefix("/docs/", http.FileServer(http.Dir("./static/swaggerui"))))

	v1 := router.PathPrefix("/api/v1").Subrouter()
	v1.HandleFunc("/info", apiRef.Info).Methods("GET")
	v1.HandleFunc("/send", apiRef.SendTx).Methods("POST")

	v1Account := v1.PathPrefix("/account").Subrouter()
	v1Account.Use(cosmos.ValidatePubkey)
	v1Account.HandleFunc("/{pubkey}", apiRef.Account).Methods("GET")
	v1Account.HandleFunc("/{pubkey}/txs", apiRef.TxHistory).Methods("GET")

	v1Transaction := v1.PathPrefix("/tx").Subrouter()
	v1Transaction.HandleFunc("/{txid}", apiRef.Tx).Methods("GET")

	v1Gas := v1.PathPrefix("/gas").Subrouter()
	v1Gas.HandleFunc("/estimate", apiRef.EstimateGas).Methods("POST")

	v1Validators := v1.PathPrefix("/validators").Subrouter()
	v1Validators.HandleFunc("", apiRef.GetValidators).Methods("GET")
	v1Validators.HandleFunc("/{pubkey}", apiRef.GetValidator).Methods("GET")
	v1Validators.HandleFunc("/{validatorAddr}/txs", apiRef.ValidatorTxHistory).Methods("GET")

	// docs redirect paths
	router.HandleFunc("/docs", api.DocsRedirect).Methods("GET")

	http.Handle("/", router)

	return apiRef
}

// swagger:route Get /api/v1/validators v1 GetValidators
//
// Get the list of current validators.
//
// responses:
//
//	200: Validators
//	500: InternalServerError
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
// Get a specific validator.
//
// responses:
//
//	200: Validator
//	500: InternalServerError
func (a *API) GetValidator(w http.ResponseWriter, r *http.Request) {
	// pubkey validated by ValidatePubkey middleware
	pubkey := mux.Vars(r)["pubkey"]

	validator, err := a.handler.GetValidator(pubkey)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, validator)
}
