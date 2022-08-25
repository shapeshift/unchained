package osmosis

import (
	"github.com/pkg/errors"
)

func (c *HTTPClient) GetStakingDistributions() (string, error) {
	var res struct {
		MintParams struct {
			DistributionProportions struct {
				Staking string `json:"staking"`
			} `json:"distribution_proportions"`
		} `json:"params"`
	}

	_, err := c.LCD.R().SetResult(&res).Get("/osmosis/mint/v1beta1/params")
	if err != nil {
		return "0", errors.Wrapf(err, "failed to get mint params")
	}

	return res.MintParams.DistributionProportions.Staking, nil
}

func (c *HTTPClient) GetEpochProvisions() (string, error) {
	var res struct {
		EpochProvisions string `json:"epoch_provisions"`
	}

	_, err := c.LCD.R().SetResult(&res).Get("/osmosis/mint/v1beta1/epoch_provisions")
	if err != nil {
		return "0", errors.Wrapf(err, "failed to GetEpochProvisions")
	}

	return res.EpochProvisions, nil
}
