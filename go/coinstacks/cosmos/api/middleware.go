package api

import (
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
)

func validatePubkey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pubkey, ok := mux.Vars(r)["pubkey"]
		if !ok || pubkey == "" {
			handleError(w, http.StatusBadRequest, "pubkey required")
			return
		}

		if !cosmos.IsValidAddress(pubkey) {
			handleError(w, http.StatusBadRequest, fmt.Sprintf("invalid pubkey: %s", pubkey))
			return
		}

		next.ServeHTTP(w, r)

	})
}

func validateRawTx(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawTx, ok := mux.Vars(r)["rawtransactionhex"]
		if !ok || rawTx == "" {
			handleError(w, http.StatusBadRequest, "raw transaction hash required")
			return
		}

		if !cosmos.IsValidRawTx(rawTx) {
			handleError(w, http.StatusBadRequest, fmt.Sprintf("invalid transaction: %s", rawTx))
			return
		}

		next.ServeHTTP(w, r)
	})
}
