package cosmossdk

type AccountResponse struct {
	Address       string
	AccountNumber int
	Sequence      int
}

type BalanceResponse struct {
	Amount string  `json:"amount"`
	Assets []Value `json:"assets"`
}

type BlockResponse struct {
	Height    int
	Hash      string
	Timestamp int
}

type ErrorResponse struct {
	Code   int           `json:"code"`
	Msg    string        `json:"message"`
	Detail []interface{} `json:"detail"`
}

type Pagination struct {
	NextKey *[]byte `json:"next_key,omitempty"`
	Total   uint64  `json:"total,string,omitempty"`
}

type ABCIEventAttribute struct {
	Key   string
	Value string
}

type ABCIEvent struct {
	Type       string
	Attributes []ABCIEventAttribute
}

type BlockResults interface {
	GetBlockEvents() []ABCIEvent
}

type HistoryTx interface {
	GetHeight() int64
	GetIndex() int
	GetTxID() string
	FormatTx() (*Tx, error)
}

type TxHistoryResponse struct {
	Cursor string
	Txs    []Tx
}

type ValidatorsResponse struct {
	Validators []Validator
	Pagination PageResponse
}
