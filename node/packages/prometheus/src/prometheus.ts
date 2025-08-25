import client from 'prom-client'

interface PrometheusArgs {
  coinstack: string
}

export class Prometheus {
  register: client.Registry

  metrics = {
    httpRequestCounter: new client.Counter({
      name: 'unchained_http_request_count',
      help: 'Count of http requests',
      labelNames: ['method', 'route', 'statusCode'],
    }),
    httpRequestDurationSeconds: new client.Histogram({
      name: 'unchained_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'statusCode'],
    }),
    websocketCount: new client.Gauge({
      name: 'unchained_ws_client_count',
      help: 'Count of websocket client connections',
    }),
  }

  constructor({ coinstack }: PrometheusArgs) {
    this.register = new client.Registry()
    this.register.setDefaultLabels({ coinstack })

    client.collectDefaultMetrics({ register: this.register })

    Object.values(this.metrics).forEach((value) => this.register.registerMetric(value))
  }
}
