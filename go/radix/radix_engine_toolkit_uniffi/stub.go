package radix_engine_toolkit_uniffi

import "errors"

// Unchained never parses or derives Radix addresses, so every call reports the toolkit as unsupported
var errUnsupported = errors.New("radix engine toolkit is not supported by Unchained")

type Address struct {
}

func (a *Address) NetworkId() uint8 {
	return 0
}

func (a *Address) AsStr() string {
	return ""
}

func NewAddress(address string) (*Address, error) {
	return nil, errUnsupported
}

type PublicKey interface {
}

type PublicKeySecp256k1 struct {
	Value []byte
}

type PublicKeyEd25519 struct {
	Value []byte
}

func DerivePreallocatedAccountAddressFromPublicKey(publicKey PublicKey, networkId uint8) (*Address, error) {
	return nil, errUnsupported
}
