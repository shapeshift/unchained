package cosmos

import (
	"time"
)

type QueryValidatorsResponse struct {
	Validators []ValidatorResponse `json:"validators"`
	Pagination PageResponse        `json:"pagination,omitempty"`
}

type QueryValidatorResponse struct {
	Validator ValidatorResponse `json:"validator"`
}

type PageResponse struct {
	NextKey string `json:"next_key,omitempty"`
	Total   int    `json:"total,omitempty,string"`
}

type DescriptionResponse struct {
	Moniker         string `json:"moniker,omitempty"`
	Identity        string `json:"identity,omitempty"`
	Website         string `json:"website,omitempty"`
	SecurityContact string `json:"security_contact,omitempty"`
	Details         string `json:"details,omitempty"`
}

type CommissionRates struct {
	Rate          float64 `json:"rate,string"`
	MaxRate       string  `json:"max_rate"`
	MaxChangeRate string  `json:"max_change_rate"`
}

type Commission struct {
	CommissionRates `json:"commission_rates"`
	UpdateTime      time.Time `json:"update_time"`
}

type ValidatorResponse struct {
	OperatorAddress   string              `json:"operator_address,omitempty"`
	Jailed            bool                `json:"jailed,omitempty"`
	Status            string              `json:"status,omitempty"`
	Tokens            string              `json:"tokens"`
	DelegatorShares   string              `json:"delegator_shares"`
	Description       DescriptionResponse `json:"description"`
	UnbondingHeight   int                 `json:"unbonding_height,omitempty,string"`
	UnbondingTime     time.Time           `json:"unbonding_time"`
	Commission        Commission          `json:"commission"`
	MinSelfDelegation string              `json:"min_self_delegation"`
}
