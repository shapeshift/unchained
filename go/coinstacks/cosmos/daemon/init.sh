#!/bin/bash

set -e

CONFIG=/root/.gaia/config/config.toml

start() {
  MONIKER=unchained \
  CHAIN_JSON=https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/chain.json \
  MAX_OUTBOUND_PEERS=200 \
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