#!/bin/sh

set -e

apk add bash curl jq wget

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/geth/chaindata

if [ ! -f "$DATA_DIR/genesis.json" ]; then
  wget -O /data/genesis.json https://raw.githubusercontent.com/base-org/node/main/mainnet/genesis-l2.json
fi

if [ -n "$SNAPSHOT" ] && [ ! -d "$CHAINDATA_DIR" ]; then
  wget -c $SNAPSHOT -O - | tar -xzvf - --strip-components 3 -C $DATA_DIR
fi

start() {
  geth \
    --syncmode full \
    --datadir $DATA_DIR \
    --authrpc.jwtsecret /jwt.hex \
    --authrpc.port 8551 \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8545 \
    --http.api eth,net,web3,debug,txpool,engine \
    --http.vhosts "*" \
    --http.corsdomain "*" \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.port 8546 \
    --ws.api eth,net,web3,debug,txpool,engine \
    --ws.origins "*" \
    --rollup.disabletxpoolgossip=true \
    --rollup.sequencerhttp https://mainnet-sequencer.base.org \
    --rollup.halt major \
    --op-network base-mainnet \
    --state.scheme hash \
    --history.transactions 0 \
    --cache 8192 \
    --maxpeers 100 &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
