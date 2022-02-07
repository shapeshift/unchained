package websocket

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
			close(c.msg)
			c.conn.Close()
		}
	}
}

func (m *Manager) ConnectionCount() int {
	return len(m.connections)
}
