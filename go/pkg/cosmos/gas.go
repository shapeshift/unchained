package cosmos

import (
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/pkg/errors"
	"strconv"
)

func (c *HTTPClient) GetGasEstimation(txBytes []byte) (string, error) {
	var res txtypes.SimulateResponse

	reqRawBody := txtypes.SimulateRequest{TxBytes: txBytes}
	jsonBody, err := c.encoding.Marshaler.MarshalJSON(&reqRawBody)
	if err != nil {
		return "", err
	}

	ret, err := c.cosmos.R().SetBody(jsonBody).SetResult(&res).Post("/cosmos/tx/v1beta1/simulate")
	if err != nil || ret.IsError() {
		return "", err
	}

	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}

func (c *GRPCClient) GetGasEstimation(txBytes []byte) (string, error) {

	res, err := c.tx.Simulate(c.ctx, &txtypes.SimulateRequest{TxBytes: txBytes})
	if err != nil {
		return "", errors.Wrap(err, "failed to Get transaction's gas estimation")
	}

	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}
