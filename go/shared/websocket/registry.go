package websocket

import (
	"encoding/json"
	"fmt"
	"strings"
)

type Registrar interface {
	Subscribe(clientID string, subscriptionID string, addrs []string, msg chan<- []byte)
	Unsubscribe(clientID string, subscriptionID string, addrs []string, msg chan<- []byte)
	Publish(addrs []string, data interface{})
}

type Registry struct {
	// ID to addresses
	clients map[string]map[string]struct{}
	// addresses to ID to msgChan
	addresses map[string]map[string]chan<- []byte
}

func NewRegistry() *Registry {
	return &Registry{
		clients:   make(map[string]map[string]struct{}),
		addresses: make(map[string]map[string]chan<- []byte),
	}
}

func toID(clientID string, subscriptionID string) string {
	return fmt.Sprintf("%s:%s", clientID, subscriptionID)
}

func fromID(id string) (string, string) {
	parts := strings.Split(id, ":")
	return parts[0], parts[1]
}

// Subscribe addresses to a client with a dedicated msgChan to push messages back to the client
func (r *Registry) Subscribe(clientID string, subscriptionID string, addrs []string, msgChan chan<- []byte) {
	id := toID(clientID, subscriptionID)

	if _, ok := r.clients[id]; !ok {
		r.clients[id] = make(map[string]struct{})
	}

	for _, addr := range addrs {
		if _, ok := r.addresses[addr]; !ok {
			r.addresses[addr] = make(map[string]chan<- []byte)
		}

		r.clients[id][addr] = struct{}{}
		r.addresses[addr][id] = msgChan
	}
}

// Unsubscribe addresses from a client.
// If no addresses are provided, unregister the client and all associated addresses.
func (r *Registry) Unsubscribe(clientID string, subscriptionID string, addrs []string, msgChan chan<- []byte) {
	id := toID(clientID, subscriptionID)

	if _, ok := r.clients[id]; !ok {
		return
	}

	unregister := func(id string, addr string) {
		// unregister address from client
		delete(r.clients[id], addr)

		// unregister client from address
		delete(r.addresses[addr], id)

		// delete address from registry if no clients are registered anymore
		if len(r.addresses[addr]) == 0 {
			delete(r.addresses, addr)
		}
	}

	if len(addrs) == 0 {
		for addr := range r.clients[id] {
			unregister(id, addr)
		}

		delete(r.clients, id)
	} else {
		for _, addr := range addrs {
			unregister(id, addr)
		}
	}
}

// Publish message to all clients subscribed to any of the addresses provided
func (r *Registry) Publish(addrs []string, data interface{}) {
	for _, addr := range addrs {
		if _, ok := r.addresses[addr]; !ok {
			continue
		}

		for id, msgChan := range r.addresses[addr] {
			_, subscriptionID := fromID(id)

			logger.Debugf("Publish: subscriptionID: %s, address: %s", subscriptionID, addr)

			msg, err := json.Marshal(MessageResponse{Address: addr, Data: data, SubscriptionID: subscriptionID})
			if err != nil {
				logger.Errorf("failed to marshal tx message: %v", err)
				return
			}

			msgChan <- msg
		}
	}
}
