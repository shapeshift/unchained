package radix_engine_toolkit_uniffi

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

func DeriveVirtualAccountAddressFromPublicKey(publicKey PublicKey, networkId uint8) (*Address, error) {
	return nil, nil
}
