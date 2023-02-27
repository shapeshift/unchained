#!/bin/bash

set -e

[ "$DEBUG" == "true" ] && set -x

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/geth/chaindata

# shapshots provided by: https://github.com/bnb-chain/bsc-snapshots
if [[ -n $SNAPSHOT && ! -d "$CHAINDATA_DIR" ]]; then
  rm -rf $DATA_DIR/geth;
  wget -c $SNAPSHOT -O - | lz4 -cd | tar xf - -C $DATA_DIR
  mv /data/server/data-seed/geth $DATA_DIR/geth
fi

if [ ! -d "$CHAINDATA_DIR" ]; then
    geth init --datadir $DATA_DIR genesis.json
fi

start() {
  geth \
    --config config.toml \
    --datadir $DATA_DIR \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8545 \
    --http.api eth,net,web3,debug,txpool,parlia \
    --http.vhosts '*' \
    --http.corsdomain '*' \
    --ws \
    --ws.port 8546 \
    --ws.api eth,net,web3,debug,txpool,parlia \
    --ws.origins '*' \
    --syncmode full \
    --maxpeers 100 \
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
