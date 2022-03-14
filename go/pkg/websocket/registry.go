package websocket

import (
	"encoding/json"
)

type Registrar interface {
	Subscribe(clientID string, addrs []string, msg chan<- []byte)
	Unsubscribe(clientID string, addrs []string, msg chan<- []byte)
	Publish(addrs []string, data interface{})
}

type Registry struct {
	// clientID to addresses
	clients map[string]map[string]bool
	// addresses to clientID to msgChan
	addresses map[string]map[string]chan<- []byte
}

func NewRegistry() *Registry {
	return &Registry{
		clients:   make(map[string]map[string]bool),
		addresses: make(map[string]map[string]chan<- []byte),
	}
}

// Subscribe addresses to a client with a dedicated msgChan to push messages back to the client
func (r *Registry) Subscribe(clientID string, addrs []string, msgChan chan<- []byte) {
	if _, ok := r.clients[clientID]; !ok {
		r.clients[clientID] = make(map[string]bool)
	}

	for _, addr := range addrs {
		if _, ok := r.addresses[addr]; !ok {
			r.addresses[addr] = make(map[string]chan<- []byte)
		}

		r.clients[clientID][addr] = true
		r.addresses[addr][clientID] = msgChan
	}
}

// Unsubscribe addresses from a client.
// If no addresses are provided, unregister the client and all associated addresses.
func (r *Registry) Unsubscribe(clientID string, addrs []string, msgChan chan<- []byte) {
	if _, ok := r.clients[clientID]; !ok {
		return
	}

	unregister := func(clientID string, addr string) {
		// unregister address from client
		delete(r.clients[clientID], addr)

		// unregister client from address
		delete(r.addresses[addr], clientID)

		// delete address from registry if no clients are registered anymore
		if len(r.addresses[addr]) == 0 {
			delete(r.addresses, addr)
		}
	}

	if len(addrs) == 0 {
		for addr := range r.clients[clientID] {
			unregister(clientID, addr)
		}

		delete(r.clients, clientID)
	} else {
		for _, addr := range addrs {
			unregister(clientID, addr)
		}
	}
}

// Publish message to all clients subscribed to any of the addresses provided
func (r *Registry) Publish(addrs []string, data interface{}) {
	for _, addr := range addrs {
		if _, ok := r.addresses[addr]; !ok {
			continue
		}

		msg, err := json.Marshal(MessageResponse{Address: addr, Data: data})
		if err != nil {
			logger.Errorf("failed to marshal tx message: %v", err)
			return
		}

		for _, msgChan := range r.addresses[addr] {
			msgChan <- msg
		}
	}
}
