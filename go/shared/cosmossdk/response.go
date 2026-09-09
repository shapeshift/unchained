package cosmossdk

import (
	"encoding/json"
	"net/http"

	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
)

var ErrNotFound = errors.New("404 Not Found")

func CheckResponse(r *resty.Response) error {
	if r == nil {
		return errors.New("no response from upstream")
	}

	if !r.IsError() {
		return nil
	}

	if r.StatusCode() == http.StatusNotFound {
		return ErrNotFound
	}

	// cosmos sdk errors use a documented shape, so surface the reason when there is
	// one. anything else, a proxy generated html page say, is reported by status alone.
	e := &ErrorResponse{}
	if err := json.Unmarshal(r.Body(), e); err == nil && e.Msg != "" {
		return errors.Errorf("%s: %s", r.Status(), e.Msg)
	}

	return errors.New(r.Status())
}
