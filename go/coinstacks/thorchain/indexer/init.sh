#!/bin/sh

set -e

if [ ! -f "/blockstore/genesis.json" ]; then
  wget -O jq https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux64
  chmod +x jq
  mv jq /usr/bin
  wget -q -O- https://rpc-v1.ninerealms.com/genesis | jq -r .result.genesis > /blockstore/genesis.json
fi

start() {
  ./midgard config.json &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID"
  kill $PID
  while $(kill -0 $PID 2>/dev/null); do
    sleep 1
  done
}

trap 'stop' TERM INT

start

wait $PID
