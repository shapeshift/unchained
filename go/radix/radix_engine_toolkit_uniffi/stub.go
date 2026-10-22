package radix_engine_toolkit_uniffi

import "errors"

type Address struct {
}

func (a *Address) NetworkId() uint8 {
	return 0
}

func (a *Address) AsStr() string {
	return ""
}

func NewAddress(address string) (*Address, error) {
	return nil, nil
}

type PublicKey interface {
}

type PublicKeySecp256k1 struct {
	Value []byte
}

type PublicKeyEd25519 struct {
	Value []byte
}

func DeriveVirtualAccountAddressFromPublicKey(publicKey PublicKey, networkId uint8) (*Address, error) {
	return nil, nil
}

// Mayanode v1.129 uses the renamed API; this replacement does not implement Radix derivation.
func DerivePreallocatedAccountAddressFromPublicKey(publicKey PublicKey, networkId uint8) (*Address, error) {
	return nil, errors.New("radix address derivation is not supported by Unchained")
}
