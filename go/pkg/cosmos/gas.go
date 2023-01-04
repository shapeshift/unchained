package cosmos

import (
	"encoding/base64"
	"strconv"

	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetEstimateGas(rawTx string) (string, error) {
	txBytes, err := base64.StdEncoding.DecodeString(rawTx)
	if err != nil {
		return "", errors.Wrapf(err, "failed to decode rawTx: %s", rawTx)
	}

	e := &ErrorResponse{}
	res := &txtypes.SimulateResponse{}

	r, err := c.LCD.R().SetBody(txtypes.SimulateRequest{TxBytes: txBytes}).SetResult(res).SetError(e).Post("/cosmos/tx/v1beta1/simulate")
	if err != nil {
		return "", errors.Wrap(err, "failed to estimate gas")
	}

	if r.Error() != nil {
		return "", errors.Errorf("failed to estimate gas: %s", e.Msg)
	}

	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}

func (c *GRPCClient) GetEstimateGas(rawTx string) (string, error) {
	txBytes, err := base64.StdEncoding.DecodeString(rawTx)
	if err != nil {
		return "", errors.Wrapf(err, "failed to decode rawTx: %s", rawTx)
	}

	res, err := c.tx.Simulate(c.ctx, &txtypes.SimulateRequest{TxBytes: txBytes})
	if err != nil {
		return "", errors.Wrap(err, "failed to estimate gas")
	}

	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}
