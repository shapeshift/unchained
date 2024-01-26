#!/bin/bash

set -e

start() {
  MONIKER=unchained \
  CHAIN_JSON=https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/chain.json \
  MAX_NUM_OUTBOUND_PEERS=200 \
  P2P_SEEDS="ade4d8bc8cbe014af6ebdf3cb7b1e9ad36f412c0@seeds.polkachu.com:14956,8542cd7e6bf9d260fef543bc49e59be5a3fa9074@seed.publicnode.com:26656" \
  P2P_PERSISTENT_PEERS="" \
  OVERWRITE_SEEDS=1 \
  POLKACHU_NETWORK=cosmos \
  run.sh gaiad start \
    --rpc.laddr tcp://0.0.0.0:26657 \
    --minimum-gas-prices 0uatom &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID