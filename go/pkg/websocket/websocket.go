package websocket

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/shapeshift/unchained/internal/log"
)

const (
	writeWait      = 15 * time.Second
	readWait       = 15 * time.Second
	pingPeriod     = (readWait * 9) / 10
	maxMessageSize = 1024
)

var logger = log.WithoutFields()

type RequestPayload struct {
	Data struct {
		Topic     string   `json:"topic"`
		Addresses []string `json:"addresses"`
	} `json:"data"`
	Method         string `json:"method"`
	SubscriptionID string `json:"subscriptionId"`
}

type ErrorResponse struct {
	Message        string `json:"message"`
	SubscriptionID string `json:"subscriptionId"`
	Type           string `json:"type"`
}

type MessageResponse struct {
	Address        string      `json:"address"`
	Data           interface{} `json:"data"`
	SubscriptionID string      `json:"subscriptionId"`
}

// Connection represents a single websocket connection on the unchained api server
type Connection struct {
	clientID string
	conn     *websocket.Conn
	doneChan chan interface{}
	handler  Registrar
	manager  *Manager
	msgChan  chan []byte
	ticker   *time.Ticker
}

// NewConnection defines the connection and registers it with the manager
func NewConnection(conn *websocket.Conn, handler Registrar, manager *Manager) *Connection {
	c := &Connection{
		clientID: uuid.NewString(),
		conn:     conn,
		doneChan: make(chan interface{}),
		handler:  handler,
		manager:  manager,
		msgChan:  make(chan []byte),
	}

	c.manager.register <- c

	return c
}

// Start the connection heartbeat and associated ping/pong handlers and
// begin listening for any messages and handling them appropriately.
func (c *Connection) Start() {
	c.ticker = time.NewTicker(pingPeriod)

	c.conn.SetReadLimit(maxMessageSize)
	if err := c.conn.SetReadDeadline(time.Now().Add(readWait)); err != nil {
		logger.Errorf("failed to set read deadline: %+v", err)
	}

	// handle ping message from client heartbeat.
	// if there is an error responding to client, connection will be closed.
	c.conn.SetPingHandler(func(string) error {
		if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
			return err
		}
		if err := c.conn.WriteMessage(websocket.PongMessage, nil); err != nil {
			return err
		}
		return nil
	})

	// handle pong response from client and reset read deadline.
	// if no pong is receive before read deadline expires, connection will be closed.
	c.conn.SetPongHandler(func(string) error {
		if err := c.conn.SetReadDeadline(time.Now().Add(readWait)); err != nil {
			return err
		}
		return nil
	})

	// send ping message to verify health of client.
	// if there is an error responding to client, connection will be closed.
	go func() {
		for range c.ticker.C {
			if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
				logger.Errorf("failed to set write deadline: %+v", err)
			}
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}()

	go c.read()
	go c.write()
	go c.cleanup()
}

// Stop the websocket connection by unregistering with the manager and unsubscribing the client.
func (c *Connection) Stop() {
	c.handler.Unsubscribe(c.clientID, nil, c.msgChan)

	// ensure connection has not already been unregistered before unregistering.
	if _, ok := c.manager.connections[c]; ok {
		c.manager.unregister <- c
	}
}

func (c *Connection) cleanup() {
	<-c.doneChan
	c.ticker.Stop()
	if err := c.conn.WriteMessage(websocket.CloseMessage, []byte{}); err != nil {
		logger.Errorf("failed to write close message: %+v", err)
	}
	c.conn.Close()
	close(c.msgChan)
}

func (c *Connection) read() {
	defer c.Stop()

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			return
		}

		r := &RequestPayload{}
		if err := json.Unmarshal(msg, r); err != nil {
			c.writeError(fmt.Sprintf("failed to parse message: %v", err), "")
			continue
		}

		switch r.Method {
		case "subscribe":
			c.handler.Subscribe(c.clientID, r.Data.Addresses, c.msgChan)
		case "unsubscribe":
			c.handler.Unsubscribe(c.clientID, r.Data.Addresses, c.msgChan)
		default:
			c.writeError(fmt.Sprintf("%s method not implemented", r.Method), r.SubscriptionID)
		}
	}
}

func (c *Connection) write() {
	for msg := range c.msgChan {
		if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
			logger.Errorf("failed to set write deadline: %+v", err)
		}
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			logger.Errorf("failed to write message: %+v", err)
		}
	}
}

func (c *Connection) writeError(message string, subscriptionID string) {
	e := ErrorResponse{
		SubscriptionID: subscriptionID,
		Type:           "error",
		Message:        message,
	}

	msg, err := json.Marshal(e)
	if err != nil {
		logger.Errorf("failed to marshal error response: %v", err)
		return
	}

	if err := c.conn.SetWriteDeadline(time.Now().Add(writeWait)); err != nil {
		logger.Errorf("failed to set write deadline: %+v", err)
	}
	if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
		logger.Errorf("failed to write message: %+v", err)
	}
}
