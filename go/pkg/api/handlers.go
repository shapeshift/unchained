package api

import (
	"encoding/json"
	"net/http"
)

func HandleResponse(w http.ResponseWriter, status int, res interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(res)
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

	json.NewEncoder(w).Encode(e)
}
