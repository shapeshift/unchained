#!/bin/sh

set -e

[ "$DEBUG" = "true" ] && set -x

start() {
  /usr/local/bin/nitro \
  --init.url="https://snapshot.arbitrum.io/mainnet/nitro.tar" \
  --auth.jwtsecret "/jwt.hex" \
  --http.addr 0.0.0.0 \
  --http.port 8545 \
  --http.api eth,net,web3,debug,txpool,arb,parlia \
  --http.vhosts '*' \
  --http.corsdomain '*' \
  --l1.url $L1_RPC_ENDPOINT \
  --l2.chain-id=42161 \
  --ws.addr 0.0.0.0 \
  --ws.api eth,net,web3,debug,txpool \
  --ws.origins '*' \
  --http.vhosts=* &
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID