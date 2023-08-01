#!/bin/bash

set -e

start() {
  MONIKER=unchained \
  CHAIN_JSON=https://raw.githubusercontent.com/cosmos/chain-registry/master/osmosis/chain.json \
  SNAPSHOT_QUICKSYNC=https://dl2.quicksync.io/json/osmosis.json \
  P2P_POLKACHU=true \
  run.sh osmosisd start \
    --rpc.laddr tcp://0.0.0.0:26657 \
    --minimum-gas-prices 0uosmo &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
