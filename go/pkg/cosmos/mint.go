package cosmos

import (
	"fmt"
	"github.com/pkg/errors"
)


func (c *HTTPClient) GetMintParams() (string, error) {
	var res struct {
		MintParamsResponse struct {
			MintParams struct {
				DistributionProportions struct {
					Staking string `json:"staking"`
				} `json:"distribution_proportions"`
			} `json:"params"`
		} 
	}

	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/osmosis/mint/v1beta1/params"))
	if err != nil {
		return "0", errors.Wrapf(err, "failed to get mint params")
	}
	logger.Infof("res: %+v",res)
	logger.Infof("MintParamsResponse: %+v",res.MintParamsResponse)

	return res.MintParamsResponse.MintParams.DistributionProportions.Staking, nil
}

func (c *HTTPClient) GetEpochProvisions(denom string) (string, error) {
	var res struct {
		Amount struct {
			Amount string `json:"amount"`
			Denom  string `json:"denom"`
		} `json:"amount"`
	}

	_, err := c.cosmos.R().SetResult(&res).Get(fmt.Sprintf("/osmosis/mint/v1beta1/epoch_provisions"))
	if err != nil {
		return "0", errors.Wrapf(err, "failed to get total supply of: %s", denom)
	}

	return res.Amount.Amount, nil
}