// tendermint types are copies from: https://github.com/tendermint/tendermint/blob/v0.32.3/types

package binance

import (
	"time"

	abci "github.com/tendermint/tendermint/abci/types"
	"github.com/tendermint/tendermint/crypto"
	"github.com/tendermint/tendermint/libs/bytes"
	"github.com/tendermint/tendermint/proto/tendermint/version"
	"github.com/tendermint/tendermint/types"
)

type Block struct {
	Header `json:"header"`
}

type BlockID struct {
	Hash        bytes.HexBytes `json:"hash"`
	PartsHeader PartSetHeader  `json:"parts"`
}

type PartSetHeader struct {
	Total int            `json:"total"`
	Hash  bytes.HexBytes `json:"hash"`
}

type BlockMeta struct {
	BlockID BlockID `json:"block_id"`
}

type Header struct {
	// basic block info
	Version  version.Consensus `json:"version"`
	ChainID  string            `json:"chain_id"`
	Height   int64             `json:"height"`
	Time     time.Time         `json:"time"`
	NumTxs   int64             `json:"num_txs"`
	TotalTxs int64             `json:"total_txs"`

	// prev block info
	LastBlockID BlockID `json:"last_block_id"`

	// hashes of block data
	LastCommitHash bytes.HexBytes `json:"last_commit_hash"` // commit from validators from the last block
	DataHash       bytes.HexBytes `json:"data_hash"`        // transactions

	// hashes from the app output from the prev block
	ValidatorsHash     bytes.HexBytes `json:"validators_hash"`      // validators for the current block
	NextValidatorsHash bytes.HexBytes `json:"next_validators_hash"` // validators for the next block
	ConsensusHash      bytes.HexBytes `json:"consensus_hash"`       // consensus params for current block
	AppHash            bytes.HexBytes `json:"app_hash"`             // state after txs from the previous block
	LastResultsHash    bytes.HexBytes `json:"last_results_hash"`    // root hash of all results from the txs from the previous block

	// consensus info
	EvidenceHash    bytes.HexBytes `json:"evidence_hash"`    // evidence included in the block
	ProposerAddress crypto.Address `json:"proposer_address"` // original proposer of the block
}

type ResultBlock struct {
	BlockMeta *BlockMeta `json:"block_meta"`
	Block     `json:"block"`
}

type EventDataNewBlockHeader struct {
	Header `json:"header"`

	ResultBeginBlock abci.ResponseBeginBlock `json:"result_begin_block"`
	ResultEndBlock   abci.ResponseEndBlock   `json:"result_end_block"`
}

// ToEventDataNewBlockHeader converts a legacy EvenDataNewBlockHeader to current tendermint format
func (e EventDataNewBlockHeader) ToEventDataNewBlockHeader() types.EventDataNewBlockHeader {
	return types.EventDataNewBlockHeader{
		Header: types.Header{
			Version: e.Version,
			ChainID: e.ChainID,
			Height:  e.Height,
			Time:    e.Time,
			LastBlockID: types.BlockID{
				Hash: e.LastBlockID.Hash,
				PartSetHeader: types.PartSetHeader{
					Total: uint32(e.LastBlockID.PartsHeader.Total),
					Hash:  e.LastBlockID.PartsHeader.Hash,
				},
			},
			LastCommitHash:     e.LastCommitHash,
			DataHash:           e.DataHash,
			ValidatorsHash:     e.ValidatorsHash,
			NextValidatorsHash: e.NextValidatorsHash,
			ConsensusHash:      e.ConsensusHash,
			AppHash:            e.AppHash,
			LastResultsHash:    e.LastResultsHash,
			EvidenceHash:       e.EvidenceHash,
			ProposerAddress:    e.ProposerAddress,
		},
		NumTxs:           e.TotalTxs,
		ResultBeginBlock: e.ResultBeginBlock,
		ResultEndBlock:   e.ResultEndBlock,
	}
}

type EventDataTx struct {
	TxResult
}

type Tx []byte

type TxResult struct {
	Height int64                  `json:"height"`
	Index  uint32                 `json:"index"`
	Tx     Tx                     `json:"tx"`
	Result abci.ResponseDeliverTx `json:"result"`
}
