#!/bin/sh

set -e

[ "$DEBUG" = "true" ] && set -x

start() {
  /usr/local/bin/nitro \
  --init.url 'https://snapshot.arbitrum.foundation/arb1/nitro-pruned.tar' \
  --init.download-path /data/tmp \
  --persistent.chain /data \
  --init.prune full \
  --auth.jwtsecret /jwt.hex \
  --http.addr 0.0.0.0 \
  --http.port 8547 \
  --http.api eth,net,web3,debug,txpool,arb \
  --http.vhosts '*' \
  --http.corsdomain '*' \
  --ws.addr 0.0.0.0 \
  --ws.port 8548 \
  --ws.api eth,net,web3,debug,txpool,arb \
  --ws.origins '*' \
  --l1.url $L1_RPC_ENDPOINT \
  --l2.chain-id 42161 \
  --node.staker.enable='false' \
  --node.tx-lookup-limit 0 &
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID