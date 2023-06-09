#!/bin/bash

set -e

[ "$DEBUG" == "true" ] && set -x

# Download the config
wget   $(curl -s https://api.github.com/repos/bnb-chain/bsc/releases/latest |grep browser_ |grep mainnet |cut -d\" -f4)
unzip -o mainnet.zip
rm mainnet.zip

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/geth/chaindata

# shapshots provided by: https://github.com/bnb-chain/bsc-snapshots
if [[ -n $SNAPSHOT && ! -d "$CHAINDATA_DIR" ]]; then
  apk add lz4
  rm -rf $DATA_DIR/geth;
  wget -nc --timeout 0 --retry-connrefused --tries 0 $SNAPSHOT -O - | zstd -cd | tar -xf - -C $DATA_DIR
  mv /data/server/data-seed/geth $DATA_DIR/geth
fi

if [ ! -d "$CHAINDATA_DIR" ]; then
    geth init --datadir $DATA_DIR genesis.json
fi

geth snapshot insecure-prune-all --datadir $DATA_DIR ./genesis.json

start() {
  geth \
    --tries-verify-mode none \
    --syncmode snap \
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
    --maxpeers 200 \
    --rpc.allow-unprotected-txs \
    --txlookuplimit 0 \
    --cache 8000 \
    --nat none &
  PID="$!"

  hard_reset_peers &
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID