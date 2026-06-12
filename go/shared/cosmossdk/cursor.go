package cosmossdk

import (
	"encoding/base64"
	"encoding/json"

	"github.com/pkg/errors"
)

type CursorState struct {
	TxID string `json:"txid"`
	Page int    `json:"page"`
}

// Cursor stores state between paginated requests
type Cursor struct {
	BlockHeight int64                   `json:"blockHeight"`
	TxIndex     *int                    `json:"txIndex"`
	State       map[string]*CursorState `json:"state"`
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
func (c *Cursor) Decode(b64 string) error {
	bytes, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return errors.Wrapf(err, "failed to base64 decode cursor: %s", b64)
	}

	if err := json.Unmarshal(bytes, c); err != nil {
		return errors.Wrapf(err, "failed to unmarshal cursor: %s", bytes)
	}

	// json.Unmarshal into the existing State map keeps caller-supplied keys and stores a JSON
	// null pointer value as a nil *CursorState. Drop those nil entries so a malformed cursor
	// (e.g. {"state":{"x":null}}) can't leave a nil pointer to be dereferenced downstream.
	for source, state := range c.State {
		if state == nil {
			delete(c.State, source)
		}
	}

	return nil
}
