#!/bin/sh

set -e

[ "$DEBUG" = "true" ] && set -x

start() {
  /usr/local/bin/nitro \
  --chain.id 42170 \
  --chain.name nova \
  --parent-chain.connection.url $L1_RPC_ENDPOINT \
  --parent-chain.blob-client.beacon-url $L1_BEACON_ENDPOINT \
  --init.url 'https://snapshot.arbitrum.foundation/nova/nitro-pruned.tar' \
  --init.download-path /data/tmp \
  --persistent.chain /data \
  --auth.jwtsecret /jwt.hex \
  --file-logging.enable='false' \
  --http.addr 0.0.0.0 \
  --http.port 8547 \
  --http.api eth,net,web3,debug,txpool,arb \
  --http.vhosts '*' \
  --http.corsdomain '*' \
  --ws.addr 0.0.0.0 \
  --ws.port 8548 \
  --ws.api eth,net,web3,debug,txpool,arb \
  --ws.origins '*' \
  --node.staker.enable='false' \
  --execution.tx-lookup-limit 0 &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID