#!/bin/bash

set -e

apt update && apt install -y wget zstd curl jq

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/db

if [[ -n $SNAPSHOT && ! -d "$CHAINDATA_DIR" ]]; then
  wget -c $SNAPSHOT -O - | zstd -d | tar -xvf - --strip-components=3 -C $DATA_DIR
fi

start() {
  op-reth node \
    -vvv \
    --datadir $DATA_DIR \
    --authrpc.jwtsecret /jwt.hex \
    --authrpc.port 8551 \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8545 \
    --http.api eth,net,debug,txpool \
    --http.corsdomain "*" \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.port 8546 \
    --ws.api eth,net,debug,txpool \
    --ws.origins "*" \
    --chain base \
    --rollup.disable-tx-pool-gossip \
    --rollup.sequencer-http https://mainnet-sequencer.base.org \
    --max-outbound-peers=100 &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
