#!/bin/sh

set -e

start() {
  op-node \
    --network $NETWORK \
    --rpc.addr 0.0.0.0 \
    --rpc.port 9545 \
    --l1 $L1_RPC_ENDPOINT \
    --l1.trustrpc \
    --l1.rpckind debug_geth \
    --l2 http://localhost:8551 \
    --l2.jwt-secret /jwt.hex &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
