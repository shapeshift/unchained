#!/bin/sh

set -e

apk add bash curl jq

start_coin_bg() {
  geth \
    --$NETWORK \
    --authrpc.jwtsecret /jwt.hex \
    --syncmode full \
    --datadir /data \
    --db.engine pebble \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8545 \
    --http.api eth,net,web3,debug,txpool,engine \
    --http.vhosts '*' \
    --http.corsdomain '*' \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.port 8546 \
    --ws.api eth,net,web3,debug,txpool,engine \
    --ws.origins '*' \
    --state.scheme path \
    --history.transactions 0 \
    --ipcdisable \
    --nat none &
  PID="$!"
}

stop_coin() {
  echo "Catching signal and sending to PID: $PID"
  kill $PID
  while $(kill -0 $PID 2>/dev/null); do
    sleep 1
  done
}

start_coin_bg

trap 'stop_coin' SIGTERM SIGINT
wait $PID