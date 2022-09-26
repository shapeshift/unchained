package binance

import (
	"strconv"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/pkg/cosmos"
	rpctypes "github.com/tendermint/tendermint/rpc/jsonrpc/types"
)

func (c *HTTPClient) GetBlock(height *int) (*cosmos.BlockResponse, error) {
	var res *rpctypes.RPCResponse

	hs := ""
	if height != nil {
		hs = strconv.Itoa(*height)
	}

	_, err := c.RPC.R().SetResult(&res).SetQueryParam("height", hs).Get("/block")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to get block: %s", hs)
	}

	if res.Error != nil {
		return nil, errors.Errorf("failed to get block: %s: %s", hs, res.Error.Error())
	}

	block := &ResultBlock{}
	if err := c.GetEncoding().Amino.UnmarshalJSON(res.Result, block); err != nil {
		return nil, errors.Wrapf(err, "failed to decode block: %v", res.Result)
	}

	b := &cosmos.BlockResponse{
		Height:    int(block.Block.Height),
		Hash:      block.BlockMeta.BlockID.Hash.String(),
		Timestamp: int(block.Block.Time.Unix()),
	}

	return b, nil
}
