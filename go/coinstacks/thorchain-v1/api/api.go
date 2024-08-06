// Package classification Thorchain-V1 Unchained API
//
// Provides access to thorchain-v1 chain data.
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
	_ "net/http/pprof"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/cors"
	"github.com/shapeshift/unchained/internal/log"
	"github.com/shapeshift/unchained/pkg/api"
	"github.com/shapeshift/unchained/pkg/cosmos"
	"github.com/shapeshift/unchained/pkg/metrics"
	"github.com/shapeshift/unchained/pkg/websocket"
)

const (
	PORT              = 3000
	PPROF_PORT        = 3001
	GRACEFUL_SHUTDOWN = 15 * time.Second
	WRITE_TIMEOUT     = 15 * time.Second
	READ_TIMEOUT      = 15 * time.Second
	IDLE_TIMEOUT      = 60 * time.Second
)

var logger = log.WithoutFields()

type API struct {
	*cosmos.API
	handler *Handler
}

func New(httpClient *cosmos.HTTPClient, blockService *cosmos.BlockService, swaggerPath string, prometheus *metrics.Prometheus) *API {
	r := mux.NewRouter()

	handler := &Handler{
		Handler: &cosmos.Handler{
			HTTPClient:   httpClient,
			WSClient:     nil,
			BlockService: blockService,
			Denom:        "rune",
		},
	}

	manager := websocket.NewManager(prometheus)

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

	// runtime check to ensure Handler implements CoinSpecific functionality
	var _ api.BaseAPI = handler
	var _ cosmos.CoinSpecificHandler = handler

	// runtime check to ensure Handler implements CoinSpecificHandler
	if err := handler.ValidateCoinSpecific(handler); err != nil {
		logger.Panicf("%+v", err)
	}

	// pprof server
	go func() {
		logger.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", PPROF_PORT), http.DefaultServeMux))
	}()

	r.Use(api.Scheme, api.Logger(prometheus))

	r.HandleFunc("/", api.DocsRedirect).Methods("GET")

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		api.HandleResponse(w, http.StatusOK, map[string]string{"status": "up", "coinstack": "thorchain-v1", "connections": strconv.Itoa(manager.ConnectionCount())})
	}).Methods("GET")

	r.Handle("/metrics", promhttp.HandlerFor(prometheus.Registry, promhttp.HandlerOpts{}))

	r.HandleFunc("/swagger", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.FromSlash(swaggerPath))
	}).Methods("GET")

	r.PathPrefix("/docs/").Handler(http.StripPrefix("/docs/", http.FileServer(http.Dir("./static/swaggerui"))))

	v1 := r.PathPrefix("/api/v1").Subrouter()
	v1.HandleFunc("/info", a.Info).Methods("GET")

	v1Account := v1.PathPrefix("/account").Subrouter()
	v1Account.Use(cosmos.ValidatePubkey)
	v1Account.HandleFunc("/{pubkey}/txs", a.TxHistory).Methods("GET")

	v1Transaction := v1.PathPrefix("/tx").Subrouter()
	v1Transaction.HandleFunc("/{txid}", a.Tx).Methods("GET")

	// docs redirect paths
	r.HandleFunc("/docs", api.DocsRedirect).Methods("GET")

	http.Handle("/", r)

	return a
}

// swagger:route GET /api/v1/info v1 GetInfo
//
// Get information about the running coinstack.
//
// responses:
//
//	200: Info
func (a *API) Info(w http.ResponseWriter, r *http.Request) {
	a.API.Info(w, r)
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
	a.API.TxHistory(w, r)
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
	a.API.Tx(w, r)
}
