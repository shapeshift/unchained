package binance

import (
	"reflect"

	gogotypes "github.com/cosmos/gogoproto/types"
	"github.com/tendermint/tendermint/libs/bytes"
)

func isTypedNil(o interface{}) bool {
	rv := reflect.ValueOf(o)
	switch rv.Kind() {
	case reflect.Chan, reflect.Func, reflect.Map, reflect.Ptr, reflect.Slice:
		return rv.IsNil()
	default:
		return false
	}
}

// Returns true if it has zero length.
func isEmpty(o interface{}) bool {
	rv := reflect.ValueOf(o)
	switch rv.Kind() {
	case reflect.Array, reflect.Chan, reflect.Map, reflect.Slice, reflect.String:
		return rv.Len() == 0
	default:
		return false
	}
}

func cdcEncode(item interface{}) []byte {
	if item != nil && !isTypedNil(item) && !isEmpty(item) {
		switch item := item.(type) {
		case string:
			i := gogotypes.StringValue{
				Value: item,
			}
			bz, err := i.Marshal()
			if err != nil {
				return nil
			}
			return bz
		case int64:
			i := gogotypes.Int64Value{
				Value: item,
			}
			bz, err := i.Marshal()
			if err != nil {
				return nil
			}
			return bz
		case bytes.HexBytes:
			i := gogotypes.BytesValue{
				Value: item,
			}
			bz, err := i.Marshal()
			if err != nil {
				return nil
			}
			return bz
		default:
			return nil
		}
	}

	return nil
}
