#!/bin/sh

set -e

start_coin() {
  /scripts/fullnode.sh thornode start \
    --p2p.laddr=tcp://0.0.0.0:27146 \
    --proxy_app=tcp://127.0.0.1:27148 \
    --rpc.laddr=tcp://0.0.0.0:27147 &
  PID="$!"
}

stop_coin() {
  echo "Catching signal and sending to PID: $PID"
  kill $PID
  while $(kill -0 $PID 2>/dev/null); do
    sleep 1
  done
}

trap 'stop_coin' TERM INT

start_coin
wait $PID
