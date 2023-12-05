package cosmos

import (
	"encoding/json"
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetGlobalMinimumGasPrices() (map[string]sdk.Dec, error) {
	gasPrices := make(map[string]sdk.Dec)

	var res struct {
		Param struct {
			Amount string `json:"subspace"`
			Key    string `json:"key"`
			Value  string `json:"value"`
		} `json:"param"`
	}

	e := &ErrorResponse{}

	queryParams := map[string]string{
		"subspace": "globalfee",
		"key":      "MinimumGasPricesParam",
	}

	r, err := c.LCD.R().SetResult(&res).SetError(e).SetQueryParams(queryParams).Get("/cosmos/params/v1beta1/params")
	if err != nil {
		return gasPrices, errors.Wrap(err, "failed to get globalfee params")
	}

	if r.Error() != nil {
		return gasPrices, errors.Errorf("failed to get globalfee params: %s", e.Msg)
	}

	values := []struct {
		Denom  string `json:"denom"`
		Amount string `json:"amount"`
	}{}

	err = json.Unmarshal([]byte(res.Param.Value), &values)
	if err != nil {
		return gasPrices, errors.Wrapf(err, "failed to unmarshal value: %s", res.Param.Value)
	}

	for _, value := range values {
		coinStr := fmt.Sprintf("%s%s", value.Amount, value.Denom)

		coin, err := sdk.ParseDecCoin(coinStr)
		if err != nil {
			logger.Errorf("failed to parse dec coin: %s: %v", coinStr, err)
			continue
		}

		gasPrices[coin.GetDenom()] = coin.Amount
	}

	return gasPrices, nil
}

func (c *HTTPClient) GetLocalMinimumGasPrices() (map[string]sdk.Dec, error) {
	gasPrices := make(map[string]sdk.Dec)

	var res struct {
		MinimumGasPrice string `json:"minimum_gas_price"`
	}

	e := &ErrorResponse{}

	r, err := c.LCD.R().SetResult(&res).SetError(e).Get("/cosmos/base/node/v1beta1/config")
	if err != nil {
		return gasPrices, errors.Wrap(err, "failed to get base node config")
	}

	if r.Error() != nil {
		return gasPrices, errors.Errorf("failed to get base node config: %s", e.Msg)
	}

	coins, err := sdk.ParseDecCoins(res.MinimumGasPrice)
	if err != nil {
		return gasPrices, errors.Wrap(err, "failed to parse coins")
	}

	for _, coin := range coins {
		gasPrices[coin.GetDenom()] = coin.Amount
	}

	return gasPrices, nil
}
