package websocket

type Manager struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
}

func NewManager() *Manager {
	return &Manager{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (m *Manager) Start() {
	for {
		select {
		case client := <-m.register:
			m.clients[client] = true
		case client := <-m.unregister:
			delete(m.clients, client)
			close(client.msg)
			client.conn.Close()
		}
	}
}

func (m *Manager) ConnectionCount() int {
	return len(m.clients)
}
