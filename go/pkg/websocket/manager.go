package websocket

// Manager manages registering, unregistering, and signaling cleanup of client connections
type Manager struct {
	connections map[*Connection]bool
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
		case c := <-m.unregister:
			delete(m.connections, c)
			close(c.doneChan)
		}
	}
}

func (m *Manager) ConnectionCount() int {
	return len(m.connections)
}
