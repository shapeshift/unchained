package websocket

import "time"

type ClientOptions struct {
	maxMessageSize int64
	writeWait      time.Duration
	readWait       time.Duration
	pingPeriod     time.Duration
}

type Payload struct {
	ID      string   `json:"id"`
	JSONRPC string   `json:"jsonrpc"`
	Method  string   `json:"method"`
	Params  []string `json:"params"`
}
