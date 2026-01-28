package mayachain

import (
	"fmt"

	"github.com/pkg/errors"
	"github.com/shapeshift/unchained/shared/cosmossdk"
	coretypes "github.com/tendermint/tendermint/rpc/core/types"
)

func TxHistorySources(client APIClient, pubkey string, formatTx func(*coretypes.ResultTx) (*cosmossdk.Tx, error)) map[string]*cosmossdk.TxState {
	request := func(query string, page int, pageSize int) ([]cosmossdk.HistoryTx, error) {
		result, err := client.TxSearch(query, page, pageSize)
		if err != nil {
			return nil, errors.WithStack(err)
		}

		txs := []cosmossdk.HistoryTx{}
		for _, tx := range result.Txs {
			txs = append(txs, &ResultTx{ResultTx: tx, formatTx: formatTx})
		}

		return txs, nil
	}

	return map[string]*cosmossdk.TxState{
		"send":    cosmossdk.NewTxState(true, fmt.Sprintf(`"message.sender='%s'"`, pubkey), request),
		"receive": cosmossdk.NewTxState(true, fmt.Sprintf(`"transfer.recipient='%s'"`, pubkey), request),
	}
}
