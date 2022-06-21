package cosmos

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

	_, err := c.cosmos.R().SetResult(&res).Get("/osmosis/mint/v1beta1/params")
	if err != nil {
		return "0", errors.Wrapf(err, "failed to get mint params")
	}
	logger.Infof("res: %+v", res)
	logger.Infof("MintParamsResponse: %+v", res)

	return res.MintParams.DistributionProportions.Staking, nil
}

func (c *HTTPClient) GetEpochProvisions() (string, error) {
	var res struct {
		EpochProvisions string `json:"epoch_provisions"`
	}
	_, err := c.cosmos.R().SetResult(&res).Get("/osmosis/mint/v1beta1/epoch_provisions")
	if err != nil {
		return "0", errors.Wrapf(err, "failed to GetEpochProvisions")
	}
	logger.Infof("res: %+v", res)

	return res.EpochProvisions, nil
}
