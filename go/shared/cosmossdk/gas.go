package cosmossdk

import (
	"encoding/base64"

	"github.com/pkg/errors"
)

type SimulateRequest struct {
	TxBytes []byte `json:"tx_bytes"`
}

func (c *HTTPClient) GetEstimateGas(rawTx string) (string, error) {
	txBytes, err := base64.StdEncoding.DecodeString(rawTx)
	if err != nil {
		return "", errors.Wrapf(err, "failed to decode rawTx: %s", rawTx)
	}

	res := &struct {
		GasInfo struct {
			GasUsed string `json:"gas_used"`
		} `json:"gas_info"`
	}{}

	resp, err := c.LCD.R().SetBody(SimulateRequest{TxBytes: txBytes}).SetResult(res).Post("/cosmos/tx/v1beta1/simulate")
	if err != nil {
		return "", errors.Wrap(err, "failed to estimate gas")
	}

	if err := CheckResponse(resp); err != nil {
		return "", errors.Wrap(err, "failed to estimate gas")
	}

	return res.GasInfo.GasUsed, nil
}
