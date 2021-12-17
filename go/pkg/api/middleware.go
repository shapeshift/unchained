package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/shapeshift/go-unchained/internal/log"
)

type statusWriter struct {
	http.ResponseWriter
	status int
}

func newStatusWriter(w http.ResponseWriter) *statusWriter {
	return &statusWriter{w, http.StatusOK}
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// Logger middleware for request details
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sw := newStatusWriter(w)

		t := time.Now().UTC()

		next.ServeHTTP(sw, r)

		statusLogger := log.WithFields(log.Fields{"method": r.Method, "statusCode": sw.status, "responseTime": fmt.Sprintf("%s", time.Since(t))})

		if sw.status != http.StatusOK {
			statusLogger.Errorf("%s", r.RequestURI)
			return
		}

		statusLogger.Infof("%s from %s", r.RequestURI, r.RemoteAddr)
	})
}
