package cosmossdk

import (
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetTxHistory(address string, cursor string, pageSize int, sources map[string]*TxState) (*TxHistoryResponse, error) {
	history := &History{
		Cursor:   &Cursor{State: make(map[string]*CursorState)},
		PageSize: pageSize,
		State:    make(map[string]*TxState),
	}

	// set initial source state
	for source, s := range sources {
		history.Cursor.State[source] = &CursorState{Page: 1}
		history.State[source] = s
	}

	if cursor != "" {
		if err := history.Cursor.Decode(cursor); err != nil {
			return nil, errors.Wrapf(err, "failed to decode cursor: %s", cursor)
		}
	}

	// update sources with current cursor state
	for source, s := range sources {
		s.Page = history.Cursor.State[source].Page
	}

	txHistory, err := history.Get()
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get tx history for address: %s", address)
	}

	return txHistory, nil
}

func GetTxAddrs(events EventsByMsgIndex, messages []Message) []string {
	seen := make(map[string]bool)
	addrs := []string{}

	// check events for addresses
	for _, e := range events {
		for _, attributes := range e {
			for key, val := range attributes {
				switch key {
				case "spender", "sender", "receiver", "recipient", "validator":
					if _, ok := seen[val]; !ok {
						addrs = append(addrs, val)
						seen[val] = true
					}
				}

			}
		}
	}

	// check messages for addresses
	for _, m := range messages {
		if m.Addresses == nil {
			continue
		}

		// unique set of addresses
		for _, addr := range m.Addresses {
			if _, ok := seen[addr]; !ok {
				addrs = append(addrs, addr)
				seen[addr] = true
			}
		}
	}

	return addrs
}
