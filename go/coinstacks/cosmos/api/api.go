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
	"encoding/json"
	"net/http"
	"path/filepath"

	"github.com/gorilla/mux"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/internal/log"
	"github.com/shapeshift/go-unchained/pkg/api"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
)

var logger = log.WithoutFields()

type API struct {
	handler *Handler
}

func Start(httpClient *cosmos.HTTPClient, grpcClient *cosmos.GRPCClient, errChan chan<- error) {
	a := API{
		handler: &Handler{
			httpClient: httpClient,
			grpcClient: grpcClient,
		},
	}

	// compile check to ensure Handler implements BaseAPI
	var _ api.BaseAPI = a.handler

	r := mux.NewRouter()
	r.Use(api.Logger)

	r.HandleFunc("/health", health).Methods("GET")

	r.HandleFunc("/swagger", swagger).Methods("GET")
	r.PathPrefix("/docs/").Handler(http.StripPrefix("/docs/", http.FileServer(http.Dir("./static/swaggerui"))))

	v1 := r.PathPrefix("/api/v1").Subrouter()
	v1.HandleFunc("/info", a.Info).Methods("GET")
	v1Account := v1.PathPrefix("/account").Subrouter()
	v1Account.HandleFunc("/{pubkey}", a.Account).Methods("GET")
	v1Account.HandleFunc("/{pubkey}/txs", a.TxHistory).Methods("GET")

	// docs redirect paths
	r.HandleFunc("/", docsRedirect).Methods("GET")
	r.HandleFunc("/docs", docsRedirect).Methods("GET")

	http.Handle("/", r)

	logger.Info("serving application")
	if err := http.ListenAndServe(":3000", r); err != nil {
		errChan <- errors.Wrap(err, "error serving application")
	}
}

func health(w http.ResponseWriter, r *http.Request) {
	handleResponse(w, http.StatusOK, map[string]string{"status": "up", "coinstack": "cosmos"})
}

func swagger(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, filepath.FromSlash("/app/coinstacks/cosmos/api/swagger.json"))
}

func docsRedirect(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/docs/", http.StatusFound)
}

// swagger:route GET /api/v1/info v1 GetInfo
//
// Get information about the running coinstack
//
// produces:
//   - application/json
//
// responses:
//   200: Info
func (a *API) Info(w http.ResponseWriter, r *http.Request) {
	info, err := a.handler.GetInfo()
	if err != nil {
		handleError(w, http.StatusInternalServerError, err.Error())
	}
	handleResponse(w, http.StatusOK, info)
}

// swagger:route GET /api/v1/account/{pubkey} v1 GetAccount
//
// Get account details by address
//
// produces:
//   - application/json
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
// Get paginated transaction history details by address
//
// produces:
//   - application/json
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

	txHistory, err := a.handler.GetTxHistory(pubkey)
	if err != nil {
		handleError(w, http.StatusInternalServerError, err.Error())
		return
	}

	handleResponse(w, http.StatusOK, txHistory)
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
