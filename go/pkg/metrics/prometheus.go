package metrics

import (
	"reflect"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
)

type Prometheus struct {
	Registry *prometheus.Registry
	Metrics  Metrics
}

type Metrics struct {
	HTTPRequestCounter         *prometheus.CounterVec
	HTTPRequestDurationSeconds *prometheus.HistogramVec
	WebsocketCount             prometheus.Gauge
}

type Labels = prometheus.Labels

func NewPrometheus(coinstack string) *Prometheus {
	reg := prometheus.NewRegistry()

	reg.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)

	metrics := Metrics{
		HTTPRequestCounter: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name:        "unchained_http_request_count",
				Help:        "Count of http requests",
				ConstLabels: prometheus.Labels{"coinstack": coinstack},
			},
			[]string{"method", "route", "statusCode"},
		),
		HTTPRequestDurationSeconds: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:        "unchained_http_request_duration_seconds",
				Help:        "Duration of HTTP requests in seconds",
				ConstLabels: prometheus.Labels{"coinstack": coinstack},
				Buckets:     []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
			},
			[]string{"method", "route", "statusCode"},
		),
		WebsocketCount: prometheus.NewGauge(prometheus.GaugeOpts{
			Name:        "unchained_ws_client_count",
			Help:        "Count of websocket client connections",
			ConstLabels: prometheus.Labels{"coinstack": coinstack},
		}),
	}

	v := reflect.ValueOf(metrics)
	for i := 0; i < v.NumField(); i++ {
		c := v.Field(i).Interface().(prometheus.Collector)
		reg.MustRegister(c)
	}

	p := &Prometheus{
		Registry: reg,
		Metrics:  metrics,
	}

	return p
}
