#!/bin/sh

set -e

apk add curl jq wget zstd

[ "$DEBUG" = "true" ] && set -x

HOME_DIR=/root/.heimdalld
CONFIG_DIR=$HOME_DIR/config

function extract_files() {
  while read -r line; do
    if echo "$line" | grep -q checksum; then
      continue
    fi
    if echo "$line" | grep -q "bulk"; then
      wget -nc --timeout 0 --retry-connrefused --tries 0 $line -O - | zstd -cd | tar -xvkf - -C $HOME_DIR/data
    else
      wget -nc --timeout 0 --retry-connrefused --tries 0 $line -O - | zstd -cd | tar -xvkf - -C $HOME_DIR/data --strip-components=3
    fi
  done < $1
}

# shapshots provided by: https://snapshot.polygon.technology/
if [ -n "$SNAPSHOT" ]; then
  filename=$(echo $SNAPSHOT | awk -F/ '{print $NF}')

  if [ ! -f "$HOME_DIR/$filename" ] && [ ! -f "$HOME_DIR/data/priv_validator_state.json" ]; then
    rm -rf $HOME_DIR/data;
    mkdir -p $HOME_DIR/data;
  fi

  if [ -f "$HOME_DIR/$filename" ] || [ ! -f "$HOME_DIR/data/priv_validator_state.json" ]; then
    apk add wget zstd
    wget $SNAPSHOT -O $HOME_DIR/$filename
    extract_files $HOME_DIR/$filename
    rm $HOME_DIR/$filename
  fi
fi

if [ ! -d "$CONFIG_DIR" ]; then
  # init chain
  heimdalld init --home $HOME_DIR

  # overwrite genesis file
  cp /var/lib/heimdall/genesis-mainnet-v1.json $CONFIG_DIR/genesis.json
fi

start() {
  heimdalld start \
    --home $HOME_DIR \
    --rpc.laddr tcp://0.0.0.0:26657 \
    --bor_rpc_url http://localhost:8545 \
    --eth_rpc_url $ETH_RPC_URL \
    --p2p.seeds "2a53a15ffc70ad41b6876ecbe05c50a66af01e20@3.211.248.31:26656,6f829065789e5b156cbbf076f9d133b4d7725847@3.212.183.151:26656,7285a532bad665f051c0aadc31054e2e61ca2b3d@3.93.224.197:26656,0b431127d21c8970f1c353ab212be4f1ba86c3bf@184.73.124.158:26656,f4f605d60b8ffaaf15240564e58a81103510631c@159.203.9.164:26656,31b79cf4a628a4619e8e9ae95b72e4354c5a5d90@44.232.55.71:26656,a385dd467d11c4cdb0be8b51d7bfb0990f49abc3@35.199.4.13:26656,daad548c0a163faae1d8d58425f97207acf923fd@35.230.116.151:26656,81c76e82fcc3dc9a0a1554a3edaa09a632795ea8@35.221.13.28:26656" \
    --rest-server \
    --node "tcp://localhost:26657" &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
