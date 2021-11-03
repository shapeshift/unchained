#!/bin/bash

set -e

start_coin() {
  bitcoind \
    -rpcuser=user \
    -rpcpassword=password \
    -datadir=/data \
    -printtoconsole=1 \
    -server=1 \
    -whitelist=0.0.0.0/0 \
    -nolisten=1 \
    -txindex=1 \
    -disablewallet=1 \
    -zmqpubhashtx=tcp://127.0.0.1:28332 \
    -zmqpubhashblock=tcp://127.0.0.1:28332 \
    -rpcworkqueue=1100 \
    -maxmempool=2000 \
    -dbcache=4000 &
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
