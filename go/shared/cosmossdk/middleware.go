package cosmossdk

import (
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/shapeshift/unchained/shared/api"
)

type AddressValidator func(address string) bool

func ValidatePubkeyMiddleware(isValidAddress AddressValidator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			pubkey, ok := mux.Vars(r)["pubkey"]
			if !ok || pubkey == "" {
				api.HandleError(w, http.StatusBadRequest, "pubkey required")
				return
			}

			if !isValidAddress(pubkey) {
				api.HandleError(w, http.StatusBadRequest, fmt.Sprintf("invalid pubkey: %s", pubkey))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// ValidateValidatorPubkeyMiddleware creates a middleware that validates validator pubkeys
func ValidateValidatorPubkeyMiddleware(isValidValidatorAddress AddressValidator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			pubkey, ok := mux.Vars(r)["pubkey"]
			if !ok || pubkey == "" {
				api.HandleError(w, http.StatusBadRequest, "pubkey required")
				return
			}

			if !isValidValidatorAddress(pubkey) {
				api.HandleError(w, http.StatusBadRequest, fmt.Sprintf("invalid validator pubkey: %s", pubkey))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
