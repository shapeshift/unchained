package websocket

import "sync/atomic"

// Manager manages registering, unregistering, and signaling cleanup of client connections
type Manager struct {
	connections map[*Connection]bool
	count       atomic.Int64
	register    chan *Connection
	unregister  chan *Connection
}

func NewManager() *Manager {
	return &Manager{
		connections: make(map[*Connection]bool),
		register:    make(chan *Connection),
		unregister:  make(chan *Connection),
	}
}

func (m *Manager) Start() {
	for {
		select {
		case c := <-m.register:
			m.connections[c] = true
			m.count.Store(int64(len(m.connections)))
		case c := <-m.unregister:
			if _, ok := m.connections[c]; !ok {
				continue
			}
			delete(m.connections, c)
			m.count.Store(int64(len(m.connections)))
			close(c.doneChan)
		}
	}
}

func (m *Manager) ConnectionCount() int {
	return int(m.count.Load())
}
