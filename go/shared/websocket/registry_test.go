package websocket

import (
	"testing"
	"time"
)

func TestUnsubscribeReportsRemoval(t *testing.T) {
	r := NewRegistry()
	msgChan := make(chan []byte)
	done := make(chan struct{})

	r.Subscribe("c1", "s1", []string{"addrA", "addrB"}, msgChan, done)

	if r.Unsubscribe("c1", "s1", []string{"addrB"}) {
		t.Fatal("partial unsubscribe reported removal while addrA is still registered")
	}
	if n := r.addressCount("addrA"); n != 1 {
		t.Fatalf("expected addrA to stay registered, got %d", n)
	}

	if !r.Unsubscribe("c1", "s1", []string{"addrA"}) {
		t.Fatal("unsubscribing the last address did not report removal")
	}
	if n := r.clientCount(); n != 0 {
		t.Fatalf("expected no clients, got %d", n)
	}

	if !r.Unsubscribe("c1", "unknown", nil) {
		t.Fatal("unknown subscription should report as removed")
	}
}

func TestUnsubscribeClientRemovesAllSubscriptions(t *testing.T) {
	r := NewRegistry()
	done := make(chan struct{})

	r.Subscribe("c1", "s1", []string{"addrA"}, make(chan []byte), done)
	r.Subscribe("c1", "s2", []string{"addrB"}, make(chan []byte), done)
	r.Subscribe("c2", "s1", []string{"addrA"}, make(chan []byte), done)

	r.UnsubscribeClient("c1")

	if n := r.addressCount("addrA"); n != 1 {
		t.Fatalf("expected only c2 on addrA, got %d", n)
	}
	if n := r.addressCount("addrB"); n != 0 {
		t.Fatalf("expected addrB to be removed, got %d", n)
	}
	if n := r.clientCount(); n != 1 {
		t.Fatalf("expected one client left, got %d", n)
	}
}

func TestPublishDoesNotBlockOnStoppedClient(t *testing.T) {
	r := NewRegistry()
	done := make(chan struct{})

	// unbuffered with no reader: a send would block forever
	r.Subscribe("c1", "s1", []string{"addrA"}, make(chan []byte), done)
	close(done)

	published := make(chan struct{})
	go func() {
		r.Publish([]string{"addrA"}, "data")
		close(published)
	}()

	select {
	case <-published:
	case <-time.After(time.Second):
		t.Fatal("publish blocked on a stopped client")
	}
}

func TestRecoverPublish(t *testing.T) {
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		defer RecoverPublish()
		panic("boom")
	}()

	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("goroutine did not finish")
	}
}
