package binance

import (
	"encoding/base64"
	"encoding/json"

	"github.com/pkg/errors"
)

// Cursor stores state of last transaction history request
type Cursor struct {
	BlockHeight int     `json:"blockHeight"`
	TxIndex     *uint32 `json:"txIndex"`
	TxID        string  `json:"txId"`
	StartTime   int64   `json:"startTime"`
	EndTime     int64   `json:"endTime"`
}

// encode Cursor struct as a base64 string
func (c *Cursor) encode() (string, error) {
	bytes, err := json.Marshal(c)
	if err != nil {
		return "", errors.Wrapf(err, "failed to marshal cursor: %+v", c)
	}

	return base64.StdEncoding.EncodeToString(bytes), nil
}

// decode base64 string and unmarshal value into Cursor struct
func (c *Cursor) decode(b64 string) error {
	bytes, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return errors.Wrapf(err, "failed to base64 decode cursor: %s", b64)
	}

	if err := json.Unmarshal(bytes, c); err != nil {
		return errors.Wrapf(err, "failed to unmarshal cursor: %s", bytes)
	}

	return nil
}
