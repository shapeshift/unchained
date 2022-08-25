package cosmos

import (
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/shapeshift/unchained/pkg/api"
)

func ValidatePubkey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pubkey, ok := mux.Vars(r)["pubkey"]
		if !ok || pubkey == "" {
			api.HandleError(w, http.StatusBadRequest, "pubkey required")
			return
		}

		if !IsValidAddress(pubkey) {
			api.HandleError(w, http.StatusBadRequest, fmt.Sprintf("invalid pubkey: %s", pubkey))
			return
		}

		next.ServeHTTP(w, r)
	})
}

func ValidateValidatorPubkey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pubkey, ok := mux.Vars(r)["pubkey"]
		if !ok || pubkey == "" {
			api.HandleError(w, http.StatusBadRequest, "pubkey required")
			return
		}

		if !IsValidValidatorAddress(pubkey) {
			api.HandleError(w, http.StatusBadRequest, fmt.Sprintf("invalid validator pubkey: %s", pubkey))
			return
		}

		next.ServeHTTP(w, r)
	})
}
