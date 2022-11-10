#!/bin/bash

set -e

start() {
  /avalanchego/build/avalanchego \
    --data-dir /data \
    --http-port 8332 \
    --chain-config-dir=/configs/chains &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
