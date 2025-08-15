package cosmos

import (
	"encoding/base64"

	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/pkg/errors"
)

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

	e := &ErrorResponse{}

	r, err := c.LCD.R().SetBody(txtypes.SimulateRequest{TxBytes: txBytes}).SetResult(res).SetError(e).Post("/cosmos/tx/v1beta1/simulate")
	if err != nil {
		return "", errors.Wrap(err, "failed to estimate gas")
	}

	if r.Error() != nil {
		return "", errors.Errorf("failed to estimate gas: %s", e.Msg)
	}

	return res.GasInfo.GasUsed, nil
}
