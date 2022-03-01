package cosmos

import (
	"encoding/base64"
	"encoding/json"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/pkg/errors"
	"strconv"
)

func (c *HTTPClient) GetEstimateGas(txBytes []byte) (string, error) {
	var res txtypes.SimulateResponse
	type retStatus struct {
		Code   uint32        `json:"code"`
		Msg    string        `json:"message"`
		Detail []interface{} `json:"detail"`
	}
	reqData, err := base64.StdEncoding.DecodeString(string(txBytes))
	if err != nil {
		return "", errors.Wrapf(err, "error decoding transaction from base64")
	}
	reqRawBody := txtypes.SimulateRequest{TxBytes: reqData}
	jsonBody, err := c.encoding.Marshaler.MarshalJSON(&reqRawBody)
	if err != nil {
		return "", err
	}

	ret, err := c.cosmos.R().SetBody(jsonBody).SetResult(&res).Post("/cosmos/tx/v1beta1/simulate")
	if err != nil || ret.StatusCode() != 200 {
		var errorMsg = retStatus{}
		json.Unmarshal(ret.Body(), &errorMsg)
		return errorMsg.Msg, errors.Wrapf(err, errorMsg.Msg)
	}

	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}

func (c *GRPCClient) GetEstimateGas(txBytes []byte) (string, error) {

	res, err := c.tx.Simulate(c.ctx, &txtypes.SimulateRequest{TxBytes: txBytes})
	if err != nil {
		return "", errors.Wrap(err, "failed to Get transaction's gas estimation")
	}

	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}
