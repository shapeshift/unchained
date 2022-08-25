// Package classification Osmosis Unchained API
//
// Provides access to osmosis chain data.
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
	"github.com/shapeshift/unchained/coinstacks/osmosis"
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

func New(httpClient *osmosis.HTTPClient, grpcClient *cosmos.GRPCClient, wsClient *cosmos.WSClient, blockService *cosmos.BlockService, swaggerPath string) *API {
	r := mux.NewRouter()

	handler := &Handler{
		Handler: &cosmos.Handler{
			HTTPClient:   httpClient.HTTPClient,
			GRPCClient:   grpcClient,
			WSClient:     wsClient,
			BlockService: blockService,
			Denom:        "uosmo",
		},
		HTTPClient: httpClient,
	}

	manager := websocket.NewManager()

	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", PORT),
		WriteTimeout: WRITE_TIMEOUT,
		ReadTimeout:  READ_TIMEOUT,
		IdleTimeout:  IDLE_TIMEOUT,
		Handler:      cors.AllowAll().Handler(r),
	}

	a := &API{
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

	r.Use(api.Scheme)
	r.Use(api.Logger)

	r.HandleFunc("/", a.Root).Methods("GET")

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		api.HandleResponse(w, http.StatusOK, map[string]string{"status": "up", "coinstack": "osmosis", "connections": strconv.Itoa(manager.ConnectionCount())})
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
	v1Validators.Use(cosmos.ValidateValidatorPubkey)
	v1Validators.HandleFunc("", a.GetValidators).Methods("GET")
	v1Validators.HandleFunc("/{pubkey}", a.GetValidator).Methods("GET")

	// docs redirect paths
	r.HandleFunc("/docs", api.DocsRedirect).Methods("GET")

	http.Handle("/", r)

	return a
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
