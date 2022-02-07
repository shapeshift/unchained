package websocket

import "time"

type ClientOptions struct {
	maxMessageSize int64
	writeWait      time.Duration
	readWait       time.Duration
	pingPeriod     time.Duration
}

type ErrorResponse struct {
	SubscriptionID string `json:"subscriptionId"`
	Type           string `json:"type"`
	Message        string `json:"message"`
}

type Handler interface {
	Subscribe(addrs []string, msg chan<- []byte)
	Unsubscribe(addrs []string)
}

type Payload struct {
	ID      string   `json:"id"`
	JSONRPC string   `json:"jsonrpc"`
	Method  string   `json:"method"`
	Params  []string `json:"params"`
}

type RequestPayload struct {
	SubscriptionID string   `json:"subscriptionId"`
	Method         string   `json:"method"`
	Data           []string `json:"data"`
}
