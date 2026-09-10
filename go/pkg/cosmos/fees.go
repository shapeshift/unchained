package cosmos

import (
	"fmt"

	sdkmath "cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/shared/cosmossdk"
)

func (c *HTTPClient) GetGlobalMinimumGasPrices() (map[string]sdkmath.LegacyDec, error) {
	gasPrices := make(map[string]sdkmath.LegacyDec)

	var res struct {
		Price struct {
			Amount string `json:"amount"`
			Denom  string `json:"denom"`
		} `json:"price"`
	}

	url := fmt.Sprintf("/feemarket/v1/gas_price/%s", c.Denom)
	resp, err := c.LCD.R().SetResult(&res).Get(url)
	if err != nil {
		return gasPrices, errors.Wrap(err, "failed to get globalfee params")
	}

	if err := cosmossdk.CheckResponse(resp); err != nil {
		return gasPrices, errors.Wrap(err, "failed to get globalfee params")
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

	resp, err := c.LCD.R().SetResult(&res).Get("/cosmos/base/node/v1beta1/config")
	if err != nil {
		return gasPrices, errors.Wrap(err, "failed to get base node config")
	}

	if err := cosmossdk.CheckResponse(resp); err != nil {
		return gasPrices, errors.Wrap(err, "failed to get base node config")
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
