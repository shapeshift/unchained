package cosmos

import (
	"fmt"
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetEpochs(denom string) (string, error) {
	var res struct {
		Amount struct {
			Amount string `json:"amount"`
			Denom  string `json:"denom"`
		} `json:"amount"`
	}

	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/osmosis/epochs/v1beta1/epochs"))
	if err != nil {
		return "0", errors.Wrapf(err, "failed to get total supply of: %s", denom)
	}

	return res.Amount.Amount, nil
}