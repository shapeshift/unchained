#!/bin/sh

set -e

apk add bash curl jq wget zstd tar pv

[ "$DEBUG" = "true" ] && set -x

HOME_DIR=/root/.heimdalld
CONFIG_DIR=$HOME_DIR/config

# shapshots provided by: https://snapshot.polygon.technology/
if [ -n "$SNAPSHOT" ] && [ ! -f "$HOME_DIR/data/priv_validator_state.json" ]; then
  rm -rf $HOME_DIR/data;
  mkdir -p $HOME_DIR/data;
  curl -L $SNAPSHOT | bash -s -- --network mainnet --client heimdall --extract-dir $HOME_DIR/data --validate-checksum true
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
    --chain mainnet \
    --rpc.laddr tcp://0.0.0.0:26657 \
    --bor_rpc_url http://localhost:8545 \
    --eth_rpc_url $ETH_RPC_URL \
    --p2p.seeds '1500161dd491b67fb1ac81868952be49e2509c9f@52.78.36.216:26656,dd4a3f1750af5765266231b9d8ac764599921736@3.36.224.80:26656,8ea4f592ad6cc38d7532aff418d1fb97052463af@34.240.245.39:26656,e772e1fb8c3492a9570a377a5eafdb1dc53cd778@54.194.245.5:26656,6726b826df45ac8e9afb4bdb2469c7771bd797f1@52.209.21.164:26656' \
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
