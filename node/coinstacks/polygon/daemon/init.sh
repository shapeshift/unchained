#!/bin/sh

set -e

apk add bash curl jq wget zstd tar pv aria2

[ "$DEBUG" = "true" ] && set -x

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/bor/chaindata

# shapshots provided by: https://snapshot.polygon.technology/
if [ -n "$SNAPSHOT" ] && [ ! -d "$CHAINDATA_DIR" ]; then
  rm -rf $DATA_DIR/bor;
  mkdir -p $CHAINDATA_DIR;
  curl -L $SNAPSHOT | bash -s -- --network mainnet --client bor --extract-dir $CHAINDATA_DIR --validate-checksum true
fi

if [ ! -f "$DATA_DIR/bor/genesis.json" ]; then
  # copy genesis file
  cp /var/lib/bor/genesis-mainnet-v1.json $DATA_DIR/bor/genesis.json
fi

start() {
  bor server \
    --chain $DATA_DIR/bor/genesis.json \
    --syncmode full \
    --datadir /data \
    --bootnodes enode://b8f1cc9c5d4403703fbf377116469667d2b1823c0daf16b7250aa576bacf399e42c3930ccfcb02c5df6879565a2b8931335565f0e8d3f8e72385ecf4a4bf160a@3.36.224.80:30303", "enode://8729e0c825f3d9cad382555f3e46dcff21af323e89025a0e6312df541f4a9e73abfa562d64906f5e59c51fe6f0501b3e61b07979606c56329c020ed739910759@54.194.245.5:30303 \
    --maxpeers 150 \
    --http \
    --http.addr 0.0.0.0 \
    --http.api eth,net,web3,debug,txpool,bor \
    --http.vhosts '*' \
    --http.corsdomain '*' \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.api eth,net,web3,debug,txpool,bor \
    --ws.origins '*' \
    --txlookuplimit 0 \
    --cache 8192 \
    --nat none &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill -2 $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
