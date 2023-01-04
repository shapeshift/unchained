#!/bin/sh

set -e

start_coin_bg() {
  geth \
    --$NETWORK \
    --authrpc.jwtsecret /jwt.hex \
    --syncmode full \
    --datadir /data \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8332 \
    --http.api eth,net,web3,debug,txpool,engine \
    --http.vhosts '*' \
    --http.corsdomain '*' \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.port 8333 \
    --ws.api eth,net,web3,debug,txpool,engine \
    --ws.origins '*' \
    --txlookuplimit 0 \
    --cache 4096 \
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