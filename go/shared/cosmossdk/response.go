package cosmossdk

import (
	"encoding/json"
	"net/http"

	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
)

// grpc-gateway writes the grpc status code into the lcd error body, 5 is codes.NotFound
const lcdNotFoundCode = 5

var ErrNotFound = errors.New("404 Not Found")

func CheckResponse(r *resty.Response) error {
	if r == nil {
		return errors.New("no response from upstream")
	}

	// resty only populates the result on a 2xx with a json or xml body
	if r.IsSuccess() {
		ct := r.Header().Get("Content-Type")
		if !resty.IsJSONType(ct) && !resty.IsXMLType(ct) {
			return errors.Errorf("%s: unexpected content type: %q", r.Status(), ct)
		}

		return nil
	}

	e := &ErrorResponse{}
	if err := json.Unmarshal(r.Body(), e); err == nil && e.Msg != "" {
		// a bare 404 from a proxy or unrouted path is not a missing resource
		if r.StatusCode() == http.StatusNotFound && e.Code == lcdNotFoundCode {
			return errors.Wrap(ErrNotFound, e.Msg)
		}

		return errors.Errorf("%s: %s", r.Status(), e.Msg)
	}

	return errors.New(r.Status())
}
