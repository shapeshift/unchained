package api

import (
	"github.com/shapeshift/go-unchained/pkg/api"
	"github.com/shapeshift/go-unchained/pkg/cosmos"
)

//Contains info about the running coinstack
//swagger:model Info
type Info struct {
	// swagger:allOf
	api.BaseInfo
}

type Account struct {
	api.BaseAccount
	AccountNumber int            `json:"accountNumber"`
	Sequence      int            `json:"sequence"`
	Assets        []cosmos.Value `json:"assets"`
}

type Tx struct {
	api.BaseTx
	Fee       cosmos.Value     `json:"fee"`
	GasUsed   string           `json:"gasUsed"`
	GasWanted string           `json:"gasWanted"`
	Index     int              `json:"index"`
	Memo      string           `json:"memo,omitempty"`
	Value     string           `json:"value"`
	Messages  []cosmos.Message `json:"messages"`
	Events    []cosmos.Event   `json:"events"`
}

type TxHistory struct {
	Pubkey string `json:"pubkey"`
	Txs    []Tx   `json:"txs"`
}
