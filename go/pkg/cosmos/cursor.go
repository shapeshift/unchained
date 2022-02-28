package cosmos

import (
	"encoding/base64"
	"encoding/json"

	"github.com/pkg/errors"
)

// Cursor stores state between paginated requests
type Cursor struct {
	LastBlockHeight    int    `json:"lastBlockHeight"`
	LastReceiveTxIndex *int32 `json:"lastReceiveTxIndex"`
	LastSendTxIndex    *int32 `json:"lastSendTxIndex"`
	SendPage           int    `json:"sendPage"`
	ReceivePage        int    `json:"receivePage"`
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
