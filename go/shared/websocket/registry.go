package websocket

import (
	"encoding/json"
	"fmt"
	"runtime/debug"
	"strings"
	"sync"
)

type Registrar interface {
	Subscribe(clientID string, subscriptionID string, addrs []string, msg chan<- []byte, done <-chan struct{})
	// Unsubscribe reports whether the subscription has no addresses left and was removed from the registry
	Unsubscribe(clientID string, subscriptionID string, addrs []string) bool
	UnsubscribeClient(clientID string)
	Publish(addrs []string, data interface{})
}

// subscriber is the delivery target for a subscription.
// done is closed when the owning connection stops, so a publish never blocks on a dead client.
type subscriber struct {
	msgChan chan<- []byte
	done    <-chan struct{}
}

type Registry struct {
	m sync.RWMutex
	// ID to addresses
	clients map[string]map[string]struct{}
	// addresses to ID to subscriber
	addresses map[string]map[string]subscriber
}

func NewRegistry() *Registry {
	return &Registry{
		clients:   make(map[string]map[string]struct{}),
		addresses: make(map[string]map[string]subscriber),
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
func (r *Registry) Subscribe(clientID string, subscriptionID string, addrs []string, msgChan chan<- []byte, done <-chan struct{}) {
	id := toID(clientID, subscriptionID)

	r.m.Lock()
	defer r.m.Unlock()

	if _, ok := r.clients[id]; !ok {
		r.clients[id] = make(map[string]struct{})
	}

	for _, addr := range addrs {
		if _, ok := r.addresses[addr]; !ok {
			r.addresses[addr] = make(map[string]subscriber)
		}

		r.clients[id][addr] = struct{}{}
		r.addresses[addr][id] = subscriber{msgChan: msgChan, done: done}
	}
}

// Unsubscribe addresses from a client.
// If no addresses are provided, unregister the client and all associated addresses.
// Returns true if the subscription is no longer registered.
func (r *Registry) Unsubscribe(clientID string, subscriptionID string, addrs []string) bool {
	r.m.Lock()
	defer r.m.Unlock()

	return r.unsubscribe(toID(clientID, subscriptionID), addrs)
}

// UnsubscribeClient unregisters every subscription owned by a client
func (r *Registry) UnsubscribeClient(clientID string) {
	prefix := clientID + ":"

	r.m.Lock()
	defer r.m.Unlock()

	for id := range r.clients {
		if strings.HasPrefix(id, prefix) {
			r.unsubscribe(id, nil)
		}
	}
}

// unsubscribe must be called with the write lock held
func (r *Registry) unsubscribe(id string, addrs []string) bool {
	if _, ok := r.clients[id]; !ok {
		return true
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
	} else {
		for _, addr := range addrs {
			if _, ok := r.clients[id][addr]; !ok {
				continue
			}
			unregister(id, addr)
		}
	}

	if len(r.clients[id]) > 0 {
		return false
	}

	delete(r.clients, id)

	return true
}

// Publish message to all clients subscribed to any of the addresses provided
func (r *Registry) Publish(addrs []string, data interface{}) {
	// held while sending, so a client can't unsubscribe mid publish
	r.m.RLock()
	defer r.m.RUnlock()

	for _, addr := range addrs {
		if _, ok := r.addresses[addr]; !ok {
			continue
		}

		for id, sub := range r.addresses[addr] {
			_, subscriptionID := fromID(id)

			logger.Debugf("Publish: subscriptionID: %s, address: %s", subscriptionID, addr)

			msg, err := json.Marshal(MessageResponse{Address: addr, Data: data, SubscriptionID: subscriptionID})
			if err != nil {
				logger.Errorf("failed to marshal tx message: %v", err)
				return
			}

			select {
			case sub.msgChan <- msg:
			case <-sub.done:
			}
		}
	}
}

// RecoverPublish logs and swallows a panic so a failed publish can't take down the process.
// Must be deferred directly: defer websocket.RecoverPublish()
func RecoverPublish() {
	if r := recover(); r != nil {
		logger.Errorf("recovered from panic while publishing: %v\n%s", r, debug.Stack())
	}
}
