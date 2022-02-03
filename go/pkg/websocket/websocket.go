package websocket

import (
	"time"

	"github.com/gorilla/websocket"
	"github.com/shapeshift/go-unchained/internal/log"
)

var logger = log.WithoutFields()

const (
	writeWait      = 10 * time.Second
	pongWait       = 10 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

type Connection struct {
	conn   *websocket.Conn
	msg    chan []byte
	ticker *time.Ticker
}

func NewConnection(conn *websocket.Conn) (*Connection, error) {
	ws := &Connection{
		conn: conn,
		msg:  make(chan []byte),
	}

	return ws, nil
}

func (ws *Connection) Start() {
	go ws.Read()
	go ws.Write()
}

func (ws *Connection) Read() {
	defer func() {
		ws.conn.Close()
	}()

	ws.conn.SetReadLimit(maxMessageSize)
	ws.conn.SetReadDeadline(time.Now().Add(pongWait))
	ws.conn.SetPongHandler(func(string) error {
		ws.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := ws.conn.ReadMessage()
		if err != nil {
			return
		}

		ws.msg <- msg
	}
}

func (ws *Connection) Write() {
	defer func() {
		ws.conn.Close()
		ws.ticker.Stop()
	}()

	ws.ticker = time.NewTicker(pingPeriod)

	ws.conn.SetPingHandler(func(string) error {
		ws.conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := ws.conn.WriteMessage(websocket.PongMessage, nil); err != nil {
			return err
		}
		return nil
	})

	for {
		select {
		case message, ok := <-ws.msg:
			ws.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				ws.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := ws.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				logger.Errorf("failed to write text message: %v", err)
				return
			}
		case <-ws.ticker.C:
			ws.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := ws.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (ws *Connection) Shutdown() {
	ws.conn.Close()
}
