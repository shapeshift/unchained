package websocket

import (
	"time"

	"github.com/gorilla/websocket"
	"github.com/shapeshift/go-unchained/internal/log"
)

const (
	writeWait      = 15 * time.Second
	readWait       = 15 * time.Second
	pingPeriod     = (readWait * 9) / 10
	maxMessageSize = 1024
)

var logger = log.WithoutFields()

type Connection struct {
	conn    *websocket.Conn
	manager *Manager
	msg     chan []byte
}

func NewConnection(conn *websocket.Conn, manager *Manager) *Connection {
	c := &Connection{
		conn:    conn,
		manager: manager,
		msg:     make(chan []byte),
	}

	c.manager.register <- c

	return c
}

func (c *Connection) Start() {
	go c.Read()
	go c.Write()
}

func (c *Connection) Read() {
	defer func() {
		c.Shutdown()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(readWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(readWait))
		return nil
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			return
		}

		c.msg <- msg
	}
}

func (c *Connection) Write() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	c.conn.SetPingHandler(func(string) error {
		c.conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := c.conn.WriteMessage(websocket.PongMessage, nil); err != nil {
			return err
		}
		return nil
	})

	for {
		select {
		case message, ok := <-c.msg:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				logger.Errorf("failed to write text message: %v", err)
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Connection) Shutdown() {
	if _, ok := c.manager.connections[c]; ok {
		c.manager.unregister <- c
	}
}
