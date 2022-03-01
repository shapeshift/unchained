package cosmos

import (
	"encoding/base64"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/pkg/errors"
	"strconv"
)

func (c *HTTPClient) GetGasEstimation(txBytes []byte) (string, error) {
	var res txtypes.SimulateResponse
	//var errMsg struct{
	//	msg interface{}
	//}
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
	if err != nil || ret.IsError() {

		return "", errors.Wrapf(err, "error ")
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
