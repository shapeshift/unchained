package cosmos

import (
	"context"
	"reflect"
	"testing"

	cryptotypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/simapp/params"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"google.golang.org/grpc"
)

func TestNewGRPCClient(t *testing.T) {
	type args struct {
		conf Config
	}
	tests := []struct {
		name    string
		args    args
		want    *GRPCClient
		wantErr bool
	}{
		// TODO: Add test cases.
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NewGRPCClient(tt.args.conf)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewGRPCClient() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("NewGRPCClient() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGRPCClient_Shutdown(t *testing.T) {
	type fields struct {
		ctx      context.Context
		encoding *params.EncodingConfig
		grpcConn *grpc.ClientConn
		auth     authtypes.QueryClient
		bank     banktypes.QueryClient
	}
	tests := []struct {
		name   string
		fields fields
	}{
		// TODO: Add test cases.
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := &GRPCClient{
				ctx:      tt.fields.ctx,
				encoding: tt.fields.encoding,
				grpcConn: tt.fields.grpcConn,
				auth:     tt.fields.auth,
				bank:     tt.fields.bank,
			}
			c.Shutdown()
		})
	}
}

func TestNewEncoding(t *testing.T) {
	type args struct {
		registerInterfaces []func(r cryptotypes.InterfaceRegistry)
	}
	tests := []struct {
		name string
		args args
		want *params.EncodingConfig
	}{
		// TODO: Add test cases.
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NewEncoding(tt.args.registerInterfaces...); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("NewEncoding() = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_isValidAddress(t *testing.T) {
	type args struct {
		address string
	}
	tests := []struct {
		name string
		args args
		want bool
	}{
		// TODO: Add test cases.
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isValidAddress(tt.args.address); got != tt.want {
				t.Errorf("isValidAddress() = %v, want %v", got, tt.want)
			}
		})
	}
}
