package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/pkg/errors"
	"github.com/shapeshift/go-unchained/internal/log"
	"github.com/shapeshift/go-unchained/pkg/api"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
)

var logger = log.WithoutFields()

type API struct {
	handler Handler
}

func Start(httpClient *cosmos.HTTPClient, grpcClient *cosmos.GRPCClient, errChan chan<- error) {
	a := API{
		handler: Handler{
			httpClient: httpClient,
			grpcClient: grpcClient,
		},
	}

	router := mux.NewRouter()
	router.Use(api.Logger)

	v1 := router.PathPrefix("/api/v1").Subrouter()
	v1.HandleFunc("/info", a.Info).Methods("GET")
	v1Account := v1.PathPrefix("/account").Subrouter()
	v1Account.HandleFunc("/{pubkey}", a.Account).Methods("GET")
	v1Account.HandleFunc("/{pubkey}/txs", a.TxHistory).Methods("GET")

	http.Handle("/", router)

	logger.Info("serving application")
	if err := http.ListenAndServe(":3000", router); err != nil {
		errChan <- errors.Wrap(err, "error serving application")
	}
}

func (a *API) Info(w http.ResponseWriter, r *http.Request) {
	info, err := a.handler.GetInfo()
	if err != nil {
		handleError(w, http.StatusInternalServerError, err.Error())
	}
	handleResponse(w, http.StatusOK, info)
}

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
	json.NewEncoder(w).Encode(api.Error{Message: message})
}
