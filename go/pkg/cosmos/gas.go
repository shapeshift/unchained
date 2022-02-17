package cosmos

import (
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	authtx "github.com/cosmos/cosmos-sdk/x/auth/tx"
	"github.com/pkg/errors"
	"strconv"
)

//func (c *HTTPClient) GetGasEstimation(txBytes []byte) (string, error) {
//	var res txtypes.SimulateResponse
//
//	decodeTx, err := DecodeData(txBytes)
//	if err != nil {
//		return "", err
//	}
//
//	err = decodeTx.ValidateBasic()
//	if err != nil {
//		return "", err
//	}
//
//	wrappedTxBuilder, err := c.encoding.TxConfig.WrapTxBuilder(decodeTx)
//	if err != nil {
//		return "", err
//	}
//	reqData := wrappedTxBuilder.(authtx.ProtoTxProvider).GetProtoTx()
//	reqRawBody := txtypes.SimulateRequest{Tx: reqData}
//	jsonBody, err := c.encoding.Marshaler.MarshalJSON(&reqRawBody)
//	if err != nil {
//		return "", err
//	}
//
//	ret, err := c.cosmos.R().SetBody(jsonBody).SetResult(&res).Post("/cosmos/tx/v1beta1/simulate")
//	if err != nil || ret.IsError() {
//		var status = spb.Status{}
//		json.Unmarshal(ret.Body(), &status)
//		return status.GetMessage(), errors.Wrap(err, string(ret.Body()))
//	}
//
//	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
//}

func (c *HTTPClient) GetGasEstimation(txBytes []byte) (string, error) {

	type result struct {
		Code      int         `json:"code"`
		Data      interface{} `json:"data"`
		Log       string      `json:"log"`
		Info      string      `json:"info"`
		GasWanted string      `json:"gas_wanted"`
		GasUsed   string      `json:"gas_used"`
		Events    interface{} `json:"events"`
		Codespace string      `json:"codespace"`
	}

	type res struct {
		Jsonrpc string `json:"jsonrpc"`
		Id      string `json:"id"`
		Result  result `json:"result"`
	}
	type Txparam struct {
		Txbyte string `json:"tx"`
	}
	type req struct {
		Id      string  `json:"id"`
		Jsonrpc string  `json:"jsonrpc"`
		Method  string  `json:"method"`
		Params  Txparam `json:"params"`
	}

	decodeTx, err := DecodeData(txBytes)
	if err != nil {
		return "", err
	}

	err = decodeTx.ValidateBasic()
	if err != nil {
		return "", err
	}
	var parambyte = Txparam{Txbyte: string(txBytes)}
	var jsonBody = req{
		Jsonrpc: "2.0",
		Method:  "check_tx",
		Id:      "unchained",
		Params:  parambyte,
	}

	var parsRes res
	_, err = c.tendermint.R().SetBody(jsonBody).SetResult(&parsRes).Post("")
	if err != nil {
		return "", err

	}
	return parsRes.Result.GasUsed, nil
}

func (c *GRPCClient) GetGasEstimation(txBytes []byte) (string, error) {
	decodeTx, err := DecodeData(txBytes)
	if err != nil {
		return "", err
	}

	err = decodeTx.ValidateBasic()
	if err != nil {
		return "", err
	}

	wrappedTxBuilder, err := c.encoding.TxConfig.WrapTxBuilder(decodeTx)
	if err != nil {
		return "", err
	}

	protoProvider, ok := wrappedTxBuilder.(authtx.ProtoTxProvider)
	if !ok {
		return "", err
	}

	res, err := c.tx.Simulate(c.ctx, &txtypes.SimulateRequest{Tx: protoProvider.GetProtoTx()})
	if err != nil {
		return "", errors.Wrap(err, "failed to Get transaction's gas estimation")
	}

	return strconv.FormatUint(res.GasInfo.GasUsed, 10), nil
}
