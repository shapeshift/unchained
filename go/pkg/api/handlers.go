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
	err := json.NewEncoder(w).Encode(res)
	if err != nil {
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

	err := json.NewEncoder(w).Encode(e)
	if err != nil {
		logger.Errorf("failed to encode response: %+v", err)
	}
}
