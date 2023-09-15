#!/bin/bash

set -e

apt update && apt install -y curl jq

start() {
  ./Nethermind.Runner \
    --config gnosis \
    --datadir /data/gnosis \
    --JsonRpc.Host=0.0.0.0 \
    --JsonRpc.Port=8545 \
    --JsonRpc.JwtSecretFile=/jwt.hex \
    --JsonRpc.EnabledModules=eth,net,web3,trace,subscribe,txpool,health,rpc \
    --JsonRpc.WebSocketsPort=8546 \
    --JsonRpc.EnginePort 8551 \
    --Init.WebSocketsEnabled=true \
    --HealthChecks.Enabled=true \
    --Metrics.CountersEnabled=true &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID