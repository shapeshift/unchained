#!/bin/sh

set -e

apk add bash curl jq

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/geth/chaindata

if [ -n "$SNAPSHOT" ] && [ ! -d "$CHAINDATA_DIR" ]; then
  wget -c $SNAPSHOT -O - | tar -xvf - -C $DATA_DIR
fi

start() {
  geth \
    --networkid 10 \
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
    --rollup.enabletxpooladmission \
    --rollup.sequencerhttp https://mainnet-sequencer.optimism.io \
    --txlookuplimit 0 \
    --cache 4096 \
    --maxpeers 0 \
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
