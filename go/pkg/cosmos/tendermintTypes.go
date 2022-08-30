package cosmos

type BlockComplete struct {
	BlockID *BlockID   `json:"block_id,omitempty"`
	Block   *BlockBody `json:"block,omitempty"`
}

type BlockBody struct {
	Header     *BlockHeader     `json:"header,omitempty"`
	Data       *BlockData       `json:"data,omitempty"`
	Evidence   *BlockEvidence   `json:"evidence,omitempty"`
	LastCommit *BlockLastCommit `json:"last_commit,omitempty"`
}

type BlockEvidence struct {
	Evidence []Evidence `json:"evidence"`
}

type BlockData struct {
	Txs []string `json:"txs"`
}

type BlockHeader struct {
	Version            BlockHeaderVersion `json:"version"`
	ChainID            string             `json:"chain_id"`
	Height             string             `json:"height"`
	Time               string             `json:"time"`
	LastBlockID        BlockID            `json:"last_block_id"`
	LastCommitHash     string             `json:"last_commit_hash"`
	DataHash           string             `json:"data_hash"`
	ValidatorsHash     string             `json:"validators_hash"`
	NextValidatorsHash string             `json:"next_validators_hash"`
	ConsensusHash      string             `json:"consensus_hash"`
	AppHash            string             `json:"app_hash"`
	LastResultsHash    string             `json:"last_results_hash"`
	EvidenceHash       string             `json:"evidence_hash"`
	ProposerAddress    string             `json:"proposer_address"`
}

type BlockHeaderVersion struct {
	Block string `json:"block"`
	App   string `json:"app"`
}

type BlockID struct {
	Hash  string       `json:"hash"`
	Parts BlockIDParts `json:"parts"`
}

type BlockIDParts struct {
	Total int32  `json:"total"`
	Hash  string `json:"hash"`
}

type BlockLastCommit struct {
	Height     *string  `json:"height,omitempty"`
	Round      *int32   `json:"round,omitempty"`
	BlockID    *BlockID `json:"block_id,omitempty"`
	Signatures []Commit `json:"signatures,omitempty"`
}

type TendermintBlockResponse struct {
	ID      *int32         `json:"id,omitempty"`
	JSONRPC *string        `json:"jsonrpc,omitempty"`
	Result  *BlockComplete `json:"result,omitempty"`
}

type Commit struct {
	Type             int32   `json:"type"`
	Height           string  `json:"height"`
	Round            int32   `json:"round"`
	BlockID          BlockID `json:"block_id"`
	Timestamp        string  `json:"timestamp"`
	ValidatorAddress string  `json:"validator_address"`
	ValidatorIndex   int32   `json:"validator_index"`
	Signature        string  `json:"signature"`
}

type Evidence struct {
	Type             *string              `json:"type,omitempty"`
	Height           *int32               `json:"height,omitempty"`
	Time             *int32               `json:"time,omitempty"`
	TotalVotingPower *int32               `json:"total_voting_power,omitempty"`
	Validator        *TendermintValidator `json:"validator,omitempty"`
}

type PubKey struct {
	Type  *string `json:"type,omitempty"`
	Value *string `json:"value,omitempty"`
}

type RPCErrorResponse struct {
	JSONRPC string   `json:"jsonrpc"`
	ID      int32    `json:"id"`
	Error   RPCError `json:"error"`
}

type RPCError struct {
	Data string `json:"data"`
}

type TxResponse struct {
	JSONRPC string       `json:"jsonrpc"`
	ID      int32        `json:"id"`
	Result  TendermintTx `json:"result"`
}

type TxSearchResponse struct {
	JSONRPC string                 `json:"jsonrpc"`
	ID      int32                  `json:"id"`
	Result  TxSearchResponseResult `json:"result"`
}

type TxSearchResponseResult struct {
	Txs        []TendermintTx `json:"txs"`
	TotalCount string         `json:"total_count"`
}

type TendermintTx struct {
	Hash     *string   `json:"hash,omitempty"`
	Height   *string   `json:"height,omitempty"`
	Index    *int32    `json:"index,omitempty"`
	TxResult *TxResult `json:"tx_result,omitempty"`
	Tx       *string   `json:"tx,omitempty"`
	Proof    *TxProof  `json:"proof,omitempty"`
}

// GetIndex returns the Index field value if set, zero value otherwise.
func (o *TendermintTx) GetIndex() int32 {
	if o == nil || o.Index == nil {
		var ret int32
		return ret
	}
	return *o.Index
}

type TxResult struct {
	Log       string `json:"log"`
	GasWanted string `json:"gas_wanted"`
	GasUsed   string `json:"gas_used"`
	Tags      Event  `json:"tags"`
}

type TxProof struct {
	RootHash string `json:"RootHash"`
	Data     string `json:"Data"`
	Proof    Proof  `json:"Proof"`
}

type Proof struct {
	Total    string   `json:"total"`
	Index    string   `json:"index"`
	LeafHash string   `json:"leaf_hash"`
	Aunts    []string `json:"aunts"`
}

type TendermintValidator struct {
	PubKey      *PubKey `json:"pub_key,omitempty"`
	VotingPower *int32  `json:"voting_power,omitempty"`
	Address     *string `json:"address,omitempty"`
}
