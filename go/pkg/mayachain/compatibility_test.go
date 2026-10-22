package mayachain

import (
	"bytes"
	"encoding/base64"
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"gitlab.com/mayachain/mayanode/chain/zec/go/zec"
	mayatypes "gitlab.com/mayachain/mayanode/x/mayachain/types"
)

func TestMayanodeTransactionCompatibility(t *testing.T) {
	encoding := NewEncoding(mayatypes.RegisterInterfaces)
	msg := &mayatypes.MsgSend{
		FromAddress: sdk.AccAddress(bytes.Repeat([]byte{1}, 20)),
		ToAddress:   sdk.AccAddress(bytes.Repeat([]byte{2}, 20)),
		Amount:      sdk.NewCoins(sdk.NewInt64Coin("cacao", 100000000)),
	}
	builder := encoding.TxConfig.NewTxBuilder()
	if err := builder.SetMsgs(msg); err != nil {
		t.Fatal(err)
	}
	raw, err := encoding.TxConfig.TxEncoder()(builder.GetTx())
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []interface{}{raw, base64.StdEncoding.EncodeToString(raw)} {
		tx, _, err := DecodeTx(*encoding, input)
		if err != nil {
			t.Fatal(err)
		}
		if len(tx.GetMsgs()) != 1 {
			t.Fatalf("expected one message, got %d", len(tx.GetMsgs()))
		}
		got, ok := tx.GetMsgs()[0].(*mayatypes.MsgSend)
		if !ok || !bytes.Equal(got.FromAddress, msg.FromAddress) || !bytes.Equal(got.ToAddress, msg.ToAddress) || !got.Amount.IsEqual(msg.Amount) {
			t.Fatalf("send changed during decoding: %v", tx.GetMsgs())
		}
	}
	for _, input := range []interface{}{"not base64!", []byte{0xff}} {
		if _, _, err := DecodeTx(*encoding, input); err == nil {
			t.Fatalf("accepted malformed transaction: %v", input)
		}
	}
}

func TestZcashNativeBufferCompatibility(t *testing.T) {
	// Exercise Rust allocation, Go/C conversion and freeing against the bundled libzec.
	for _, value := range []string{"", "mayachain native buffer"} {
		buffer := zec.FfiConverterStringINSTANCE.Lower(value)
		if got := zec.FfiConverterStringINSTANCE.Lift(buffer); got != value {
			t.Fatalf("buffer round trip: got %q, want %q", got, value)
		}
	}
	if err := zec.ValidateAddressV127("invalid-address", zec.NetworkMain); err == nil {
		t.Fatal("expected native address validation to reject malformed input")
	}
}
