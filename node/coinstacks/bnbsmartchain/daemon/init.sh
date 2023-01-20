#!/bin/sh

set -e

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/geth/chaindata

start() {
  if [ ! -d "$CHAINDATA_DIR" ]; then
      geth init --datadir $DATA_DIR genesis.json
  fi

  geth \
    --networkid 56 \
    --datadir $DATA_DIR \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8545 \
    --http.api eth,net,web3,debug,txpool \
    --http.vhosts '*' \
    --http.corsdomain '*' \
    --ws \
    --ws.port 8546 \
    --ws.api eth,net,web3,debug,txpool \
    --ws.origins '*' \
    --syncmode full \
    --rpc.allow-unprotected-txs \
    --txlookuplimit 0 \
    --cache 8000 \
    --ipcdisable \
    --nat none &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
