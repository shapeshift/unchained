package cosmos

import (
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/pkg/errors"
	"strconv"
)

var encoding = NewEncoding()

func (c *HTTPClient) GetGasEstimation(txBytes []byte) (string, error) {

}

func (c *GRPCClient) GetGasEstimation(txBytes []byte) (string, error) {
	// TODO : How to get asterisk Tx structure
	if err != nil {
		return "", errors.Wrap(err, "failed to decode tx")
	}
	request := txtypes.SimulateRequest{Tx: decodedTx}

	res, err := c.tx.Simulate(c.ctx, &request)
	if err != nil {
		return "", errors.Wrap(err, "failed to Get transaction's gas estimation")
	}
	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}
