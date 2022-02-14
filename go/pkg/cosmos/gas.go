package cosmos

import (
	txtypes "github.com/cosmos/cosmos-sdk/types/tx"
	authtx "github.com/cosmos/cosmos-sdk/x/auth/tx"
	"github.com/pkg/errors"
	abcitypes "github.com/tendermint/tendermint/abci/types"
	"strconv"
)

func (c *HTTPClient) GetGasEstimation(txBytes []byte) (string, error) {
	var res struct {
		GasInfo struct {
			GasWanted string `json:"gas_wanted"`
			GasUsed   string `json:"gas_used"`
		} `json:"gas_info"`
		Result struct {
			Data   string         `json:"data"`
			Log    string         `json:"log"`
			Events []abcitypes.Event `json:"events"`
		} `json:"result"`
	}
	hexToUnmarshal, err := c.encoding.TxConfig.TxDecoder()(txBytes)
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

	_, err = c.cosmos.R().SetBody(&txtypes.SimulateRequest{Tx: protoTx}).SetResult(&res).Post("/cosmos/tx/v1beta1/simulate")
	if err != nil {
		return "", errors.Wrap(err, res.Result.Log)
	}
	if res.GasInfo.GasWanted == "" {
		return "", errors.New("gas_wanted is empty")
	}
	return res.GasInfo.GasUsed, nil
}

func (c *GRPCClient) GetGasEstimation(txBytes []byte) (string, error) {
	hexToUnmarshal, err := c.encoding.TxConfig.TxDecoder()(txBytes)
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
