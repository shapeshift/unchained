#!/bin/bash

set -e

start() {
  MONIKER=unchained \
  CHAIN_JSON=https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/chain.json \
  P2P_POLKACHU=true \
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