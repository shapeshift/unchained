// Package classification Thorchain Unchained API
//
// Provides access to thorchain chain data.
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

func New(httpClient *cosmos.HTTPClient, wsClient *cosmos.WSClient, blockService *cosmos.BlockService, indexer *AffiliateFeeIndexer, swaggerPath string, prometheus *metrics.Prometheus) *API {
	r := mux.NewRouter()

	handler := &Handler{
		Handler: &cosmos.Handler{
			HTTPClient:   httpClient,
			WSClient:     wsClient,
			BlockService: blockService,
			Denom:        "rune",
		},
		indexer: indexer,
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

	// compile check to ensure Handler implements necessary interfaces
	var _ api.BaseAPI = handler
	var _ cosmos.CoinSpecificHandler = handler

	// runtime check to ensure Handler implements CoinSpecific functionality
	if err := handler.ValidateCoinSpecific(handler); err != nil {
		logger.Panicf("%+v", err)
	}

	// pprof server
	go func() {
		logger.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", PPROF_PORT), http.DefaultServeMux))
	}()

	r.Use(api.Scheme, api.Logger(prometheus))

	r.HandleFunc("/", a.Root).Methods("GET")

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		api.HandleResponse(w, http.StatusOK, map[string]string{"status": "up", "coinstack": "thorchain", "connections": strconv.Itoa(manager.ConnectionCount())})
	}).Methods("GET")

	r.Handle("/metrics", promhttp.HandlerFor(prometheus.Registry, promhttp.HandlerOpts{}))

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

	v1Transaction := v1.PathPrefix("/tx").Subrouter()
	v1Transaction.HandleFunc("/{txid}", a.Tx).Methods("GET")

	v1Gas := v1.PathPrefix("/gas").Subrouter()
	v1Gas.HandleFunc("/estimate", a.EstimateGas).Methods("POST")

	v1Affiliate := v1.PathPrefix("/affiliate").Subrouter()
	v1Affiliate.HandleFunc("/revenue", a.AffiliateRevenue).Methods("GET")

	// docs redirect paths
	r.HandleFunc("/docs", api.DocsRedirect).Methods("GET")

	http.Handle("/", r)

	return a
}

// swagger:route GET / Websocket Websocket
//
// Subscribe to pending and confirmed transactions.
//
// responses:
//
//	200:
func (a *API) Websocket(w http.ResponseWriter, r *http.Request) {
	a.API.Websocket(w, r)
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
	a.API.Account(w, r)
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
	a.API.SendTx(w, r)
}

// swagger:route POST /api/v1/gas/estimate v1 EstimateGas
//
// Get the estimated gas cost for a transaction.
//
// responses:
//
//	200: GasAmount
//	400: BadRequestError
//	500: InternalServerError
func (a *API) EstimateGas(w http.ResponseWriter, r *http.Request) {
	a.API.EstimateGas(w, r)
}

// swagger:parameters GetAffiliateRevenue
type GetAffiliateRevenueParams struct {
	// Start timestamp
	// in: query
	Start string `json:"start"`
	// End timestamp
	// in: query
	End string `json:"end"`
}

// swagger:route Get /api/v1/affiliate/revenue v1 GetAffiliateRevenue
//
// Get total ss affiliate revenue earned.
//
// responses:
//
//	200: AffiliateRevenue
//	400: BadRequestError
//	500: InternalServerError
func (a *API) AffiliateRevenue(w http.ResponseWriter, r *http.Request) {
	start, err := strconv.Atoi(r.URL.Query().Get("start"))
	if err != nil {
		start = 0
	}

	end, err := strconv.Atoi(r.URL.Query().Get("end"))
	if err != nil {
		end = int(time.Now().UnixMilli())
	}

	affiliateRevenue, err := a.handler.GetAffiliateRevenue(start, end)
	if err != nil {
		api.HandleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	api.HandleResponse(w, http.StatusOK, affiliateRevenue)
}
