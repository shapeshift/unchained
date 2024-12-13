package cosmos

import (
	"fmt"

	sdkmath "cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetGlobalMinimumGasPrices() (map[string]sdkmath.LegacyDec, error) {
	gasPrices := make(map[string]sdkmath.LegacyDec)

	var res struct {
		Price struct {
			Amount string `json:"amount"`
			Denom  string `json:"denom"`
		} `json:"price"`
	}

	e := &ErrorResponse{}

	url := fmt.Sprintf("/feemarket/v1/gas_price/%s", c.denom)
	r, err := c.LCD.R().SetResult(&res).SetError(e).Get(url)
	if err != nil {
		return gasPrices, errors.Wrap(err, "failed to get globalfee params")
	}

	if r.Error() != nil {
		return gasPrices, errors.Errorf("failed to get globalfee params: %s", e.Msg)
	}

	amount, err := sdkmath.LegacyNewDecFromStr(res.Price.Amount)
	if err != nil {
		return gasPrices, errors.Errorf("failed to handle amount: %s", err)
	}

	gasPrices[res.Price.Denom] = amount

	return gasPrices, nil
}

func (c *HTTPClient) GetLocalMinimumGasPrices() (map[string]sdkmath.LegacyDec, error) {
	gasPrices := make(map[string]sdkmath.LegacyDec)

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
