package cosmos

import (
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetOsmosisEpochs(denom string) (string, error) {
	var res struct {
		Amount struct {
			Amount string `json:"amount"`
			Denom  string `json:"denom"`
		} `json:"amount"`
	}

	_, err := c.cosmos.R().SetResult(&res).Get("/osmosis/epochs/v1beta1/epochs")
	if err != nil {
		return "0", errors.Wrapf(err, "failed to get total supply of: %s", denom)
	}

	return res.Amount.Amount, nil
}
