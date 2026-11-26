package websocket

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func newTestServer(t *testing.T, registry *Registry) (*httptest.Server, <-chan *Connection) {
	t.Helper()

	manager := NewManager()
	go manager.Start()

	conns := make(chan *Connection, 1)
	upgrader := websocket.Upgrader{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("failed to upgrade: %v", err)
			return
		}

		c := NewConnection(conn, registry, manager)
		c.Start()
		conns <- c
	}))
	t.Cleanup(server.Close)

	return server, conns
}

func dial(t *testing.T, server *httptest.Server) *websocket.Conn {
	t.Helper()

	url := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("failed to dial: %v", err)
	}

	return conn
}

func writeJSON(t *testing.T, conn *websocket.Conn, msg string) {
	t.Helper()

	if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
		t.Fatalf("failed to write message: %v", err)
	}
}

func safePublish(registry *Registry, addrs []string) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("publish panicked: %v", r)
		}
	}()

	registry.Publish(addrs, map[string]string{"foo": "bar"})

	return nil
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool) bool {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}

	return cond()
}

func (r *Registry) addressCount(addr string) int {
	r.m.RLock()
	defer r.m.RUnlock()
	return len(r.addresses[addr])
}

func (r *Registry) clientCount() int {
	r.m.RLock()
	defer r.m.RUnlock()
	return len(r.clients)
}

// A partial unsubscribe followed by a disconnect must not leave the remaining
// addresses pointing at the closed connection.
func TestPartialUnsubscribeThenDisconnect(t *testing.T) {
	registry := NewRegistry()
	server, conns := newTestServer(t, registry)

	client := dial(t, server)
	c := <-conns

	writeJSON(t, client, `{"method":"subscribe","subscriptionId":"s1","data":{"topic":"txs","addresses":["addrA","addrB"]}}`)
	if !waitFor(t, time.Second, func() bool { return registry.addressCount("addrA") == 1 && registry.addressCount("addrB") == 1 }) {
		t.Fatal("subscription was not registered")
	}

	writeJSON(t, client, `{"method":"unsubscribe","subscriptionId":"s1","data":{"topic":"txs","addresses":["addrB"]}}`)
	if !waitFor(t, time.Second, func() bool { return registry.addressCount("addrB") == 0 }) {
		t.Fatal("partial unsubscribe was not applied")
	}

	_ = client.Close()

	select {
	case <-c.doneChan:
	case <-time.After(2 * time.Second):
		t.Fatal("connection was not stopped")
	}

	// keep publishing for a short while so the post-stop cleanup has run
	deadline := time.Now().Add(200 * time.Millisecond)
	for time.Now().Before(deadline) {
		if err := safePublish(registry, []string{"addrA"}); err != nil {
			t.Fatal(err)
		}
		time.Sleep(5 * time.Millisecond)
	}

	if n := registry.addressCount("addrA"); n != 0 {
		t.Fatalf("expected no subscribers for addrA after disconnect, got %d", n)
	}
	if n := registry.clientCount(); n != 0 {
		t.Fatalf("expected no registered clients after disconnect, got %d", n)
	}
}
