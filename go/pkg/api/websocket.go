package api

import (
	"github.com/gorilla/websocket"
	"github.com/shapeshift/go-unchained/internal/log"
)

var logger = log.WithoutFields()

type Websocket struct {
	conn *websocket.Conn
}

func NewWebsocket(conn *websocket.Conn) (*Websocket, error) {
	ws := &Websocket{
		conn: conn,
	}

	return ws, nil
}

func (ws *Websocket) Start() {
	defer ws.Shutdown()

	for {
		// Read message from browser
		msgType, msg, err := ws.conn.ReadMessage()
		if err != nil {
			return
		}

		// Print the message to the console
		logger.Infof("%s sent: %s\n", ws.conn.RemoteAddr(), string(msg))

		// Write message back to browser
		if err = ws.conn.WriteMessage(msgType, msg); err != nil {
			return
		}
	}
}

func (ws *Websocket) Shutdown() {
	ws.conn.Close()
}
