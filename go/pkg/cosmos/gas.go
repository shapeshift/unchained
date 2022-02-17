package cosmos

import (
	"encoding/json"
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	authtx "github.com/cosmos/cosmos-sdk/x/auth/tx"
	"github.com/pkg/errors"
	spb "google.golang.org/genproto/googleapis/rpc/status"
	"strconv"
)

func (c *HTTPClient) GetGasEstimation(txBytes []byte) (string, error) {
	var res txtypes.SimulateResponse

	decodeTx, err := DecodeData(txBytes)
	if err != nil {
		return "", err
	}
	wrappedTxBuilder, err := c.encoding.TxConfig.WrapTxBuilder(decodeTx)
	if err != nil {
		return "", err
	}
	reqData := wrappedTxBuilder.(authtx.ProtoTxProvider).GetProtoTx()
	reqRawBody := txtypes.SimulateRequest{Tx: reqData}
	jsonBody, err := c.encoding.Marshaler.MarshalJSON(&reqRawBody)
	if err != nil {
		return "", err
	}
	ret, err := c.cosmos.R().SetBody(jsonBody).SetResult(&res).Post("/cosmos/tx/v1beta1/simulate")

	if err != nil || ret.IsError() {
		var status = spb.Status{}
		json.Unmarshal(ret.Body(), &status)
		return status.GetMessage(), errors.Wrap(err, string(ret.Body()))
	}
	if res.GasInfo.GasUsed == 0 {
		return "", errors.New("gas_used is empty")
	}
	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}

func (c *GRPCClient) GetGasEstimation(txBytes []byte) (string, error) {
	hexToUnmarshal, err := DecodeData(txBytes)
	if err != nil {
		return "", err
	}
	reqData, err := c.encoding.TxConfig.WrapTxBuilder(hexToUnmarshal)
	if err != nil {
		return "", err
	}
	protoProvider, ok := reqData.(authtx.ProtoTxProvider)
	if !ok {
		return "", err
	}
	protoTx := protoProvider.GetProtoTx()
	res, err := c.tx.Simulate(c.ctx, &txtypes.SimulateRequest{Tx: protoTx})
	if err != nil {
		return "", errors.Wrap(err, "failed to Get transaction's gas estimation")
	}
	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}
