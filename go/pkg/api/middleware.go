package api

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
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

		// do not write status header on websocket request
		// headers can only be written once and need to be handled by the websocket upgrader
		if r.URL.Scheme == "ws" || r.URL.Scheme == "wss" {
			next.ServeHTTP(w, r)
		} else {
			next.ServeHTTP(sw, r)
		}

		statusLogger := log.WithFields(log.Fields{"method": r.Method, "statusCode": sw.status, "responseTime": fmt.Sprintf("%s", time.Since(t))})

		if sw.status < http.StatusOK || sw.status >= http.StatusBadRequest {
			statusLogger.Errorf("%s", r.RequestURI)
			return
		}

		statusLogger.Infof("%s from %s", r.RequestURI, r.RemoteAddr)
	})
}

func Scheme(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// De-facto standard header keys
		xForwardedProto := http.CanonicalHeaderKey("X-Forwarded-Proto")
		xForwardedScheme := http.CanonicalHeaderKey("X-Forwarded-Scheme")

		// RFC7239 defines a new "Forwarded: " header designed to replace the
		// existing use of X-Forwarded-* headers
		// e.g. Forwarded: for=192.0.2.60;proto=https;by=203.0.113.43
		forwarded := http.CanonicalHeaderKey("Forwarded")

		// RFC6455 defines the websocket protocol spec which includes headers
		// added to the client/server handshake
		upgrade := http.CanonicalHeaderKey("Upgrade")

		tls := false
		if r.TLS != nil {
			tls = true
		}

		// default scheme to http and update if any applicable headers are set
		var scheme string
		if proto := r.Header.Get(xForwardedProto); proto != "" {
			scheme = strings.ToLower(proto)
		} else if proto = r.Header.Get(xForwardedScheme); proto != "" {
			scheme = strings.ToLower(proto)
		} else if proto = r.Header.Get(forwarded); proto != "" {
			// match should contain at least two elements if the protocol was
			// specified in the Forwarded header. The first element will always be
			// the 'proto=' capture, which we ignore. In the case of multiple proto
			// parameters (invalid) we only extract the first.
			protoRegex := regexp.MustCompile(`(?i)(?:proto=)(https|http|wss|ws)`)
			if match := protoRegex.FindStringSubmatch(proto); len(match) > 1 {
				scheme = strings.ToLower(match[1])
			}
		} else if u := r.Header.Get(upgrade); u == "websocket" {
			if scheme = "ws"; tls {
				scheme = "wss"
			}
		} else {
			if scheme = "http"; tls {
				scheme = "http"
			}
		}

		r.URL.Scheme = scheme

		next.ServeHTTP(w, r)
	})
}
