#!/bin/sh

set -e

[ "$DEBUG" == "true" ] && set -x

HOME_DIR=/root/.heimdalld
CONFIG_DIR=$HOME_DIR/config

# shapshots provided by: https://snapshot.polygon.technology/
if [[ -n $SNAPSHOT && ! -f "$HOME_DIR/data/priv_validator_state.json" ]]; then
  rm -rf $HOME_DIR/data;
  mkdir -p $HOME_DIR/data;
  wget -c $SNAPSHOT -O - | tar -xzf - -C $HOME_DIR/data
fi

if [[ ! -d "$CONFIG_DIR" ]]; then
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
