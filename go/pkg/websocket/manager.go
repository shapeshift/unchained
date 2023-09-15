package websocket

import "github.com/shapeshift/unchained/pkg/metrics"

// Manager manages registering, unregistering, and signaling cleanup of client connections
type Manager struct {
	connections map[*Connection]bool
	register    chan *Connection
	unregister  chan *Connection
	prometheus  *metrics.Prometheus
}

func NewManager(prometheus *metrics.Prometheus) *Manager {
	return &Manager{
		connections: make(map[*Connection]bool),
		register:    make(chan *Connection),
		unregister:  make(chan *Connection),
		prometheus:  prometheus,
	}
}

func (m *Manager) Start() {
	for {
		select {
		case c := <-m.register:
			m.connections[c] = true
			m.prometheus.Metrics.WebsocketCount.Inc()
		case c := <-m.unregister:
			delete(m.connections, c)
			close(c.doneChan)
			m.prometheus.Metrics.WebsocketCount.Dec()
		}
	}
}

func (m *Manager) ConnectionCount() int {
	return len(m.connections)
}
