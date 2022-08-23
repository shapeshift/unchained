package api

import (
	"encoding/json"
	"net/http"

	"github.com/shapeshift/unchained/internal/log"
)

var logger = log.WithoutFields()

func HandleResponse(w http.ResponseWriter, status int, res interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(res); err != nil {
		logger.Errorf("failed to encode response: %+v", err)
	}
}

func HandleError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	var e interface{}

	switch status {
	case http.StatusBadRequest:
		e = BadRequestError{Error: message}
	case http.StatusInternalServerError:
		e = InternalServerError{Message: message}
	default:
		e = Error{Message: message}
	}

	if err := json.NewEncoder(w).Encode(e); err != nil {
		logger.Errorf("failed to encode response: %+v", err)
	}
}

func DocsRedirect(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/docs/", http.StatusFound)
}
