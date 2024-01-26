#!/bin/bash

set -e

[ "$DEBUG" == "true" ] && set -x

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/geth/chaindata

if [[ -n $SNAPSHOT && ! -d "$CHAINDATA_DIR" ]]; then
  echo "restoring from snapshot: $SNAPSHOT"

  apk add wget
  rm -rf $DATA_DIR/geth;

  # extract with lz4 (https://github.com/bnb-chain/bsc-snapshots)
  if echo "$SNAPSHOT" | grep -q "tar\.lz4$"; then
    apk add lz4
    wget -c $SNAPSHOT -O - | lz4 -cd | tar xf - -C $DATA_DIR --strip-components=2
  fi

  # extract with zstd (https://github.com/48Club/bsc-snapshots)
  if echo "$SNAPSHOT" | grep -q "tar\.zst$"; then
    apk add zstd
    wget -c $SNAPSHOT -O - | zstd -cd | tar xf - -C $DATA_DIR --strip-components=1
  fi
fi

if [[ ! -d "$CHAINDATA_DIR" ]]; then
  geth init --datadir $DATA_DIR genesis.json
fi

# set state scheme to path
if ! grep -q 'StateScheme = "path"' config.toml; then
  sed -i '/^\[Eth\]/a StateScheme = "path"' config.toml
fi

start() {
  geth \
    --config config.toml \
    --datadir $DATA_DIR \
    --syncmode full \
    --db.engine pebble \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8545 \
    --http.api eth,net,web3,debug,txpool \
    --http.vhosts '*' \
    --http.corsdomain '*' \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.port 8546 \
    --ws.api eth,net,web3,debug,txpool \
    --ws.origins '*' \
    --state.scheme path \
    --rpc.allow-unprotected-txs \
    --history.transactions 0 \
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