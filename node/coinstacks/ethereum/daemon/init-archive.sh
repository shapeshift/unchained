#!/bin/sh

set -e

apk add curl jq

start_coin_bg() {
  geth \
    --$NETWORK \
    --authrpc.jwtsecret /jwt.hex \
    --datadir /data \
    --http \
    --http.addr 0.0.0.0 \
    --http.port 8332 \
    --http.api eth,net,web3,debug,txpool,engine \
    --http.vhosts '*' \
    --http.corsdomain '*' \
    --ws \
    --ws.port 8333 \
    --ws.api eth,net,web3,debug,txpool,engine \
    --ws.origins '*' \
    --syncmode full \
    --txlookuplimit 0 \
    --cache 24576 \
    --cache.gc 0 \
    --cache.snapshot 20 \
    --cache.trie 30 \
    --gcmode archive \
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