#!/bin/sh

set -e

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/geth/chaindata

if [[ -n "$SNAPSHOT" && ! -d "$CHAINDATA_DIR" ]]; then
  wget -c $SNAPSHOT -O - | tar -xvf - -C $DATA_DIR
fi

if [[ -n "$GENESIS" && ! -d "$CHAINDATA_DIR" ]]; then
  geth init --datadir=$DATA_DIR $GENESIS
fi

start() {
  geth \
    --datadir=$DATA_DIR \
    --networkid=420 \
    --authrpc.addr=localhost \
    --authrpc.jwtsecret=/jwt.hex \
    --authrpc.port=8551 \
    --authrpc.vhosts="*" \
    --http \
    --http.port=8545 \
    --http.addr=0.0.0.0 \
    --http.api=eth,net,web3,debug,txpool,engine \
    --http.vhosts="*" \
    --http.corsdomain="*" \
    --ws \
    --ws.port=8546 \
    --ws.addr=0.0.0.0 \
    --ws.api=eth,net,web3,debug,txpool,engine \
    --ws.origins="*" \
    --rollup.historicalrpc=http://localhost:7545 \
    --rollup.disabletxpoolgossip=true \
    --rollup.sequencerhttp=https://goerli-sequencer.optimism.io \
    --cache=4096 \
    --syncmode=full \
    --gcmode=full \
    --maxpeers=0 \
    --nodiscover &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
