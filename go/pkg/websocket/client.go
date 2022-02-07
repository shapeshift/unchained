package websocket

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pkg/errors"
)

var defaultOpts = &ClientOptions{
	writeWait:      15 * time.Second,
	readWait:       15 * time.Second,
	pingPeriod:     (readWait * 9) / 10,
	maxMessageSize: 1024,
}

type Client struct {
	*ClientOptions
	conn *websocket.Conn
}

func NewClient(url string, header http.Header, opts *ClientOptions) (*Client, error) {
	conn, _, err := websocket.DefaultDialer.Dial(url, header)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to open websocket connection")
	}

	if opts == nil {
		opts = defaultOpts
	}

	c := &Client{
		ClientOptions: opts,
		conn:          conn,
	}

	go c.listen()

	return c, nil
}

func (c *Client) listen() {
	c.conn.SetReadLimit(c.maxMessageSize)
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

		fmt.Println(msg)
	}
}

func (c *Client) Subscribe(addrs []string, msg chan<- []byte) {

	//msg, err := json.Marshal(payload)
	//if err != nil {
	//	return errors.Wrapf(err, "failed to marshal subscription message: %+v", payload)
	//}

	//if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
	//	return errors.Wrapf(err, "failed to write message: %s", msg)
	//}

	//ticker := time.NewTicker(pingPeriod)
	//defer ticker.Stop()

	//for range ticker.C {
	//	c.conn.SetWriteDeadline(time.Now().Add(writeWait))
	//	if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
	//		return errors.Wrap(err, "failed to ping server")
	//	}
	//}

	//return nil
}

func (c *Client) Unsubscribe(addrs []string) {
}
