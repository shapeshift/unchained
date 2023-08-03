#!/bin/bash

VERSION=$(curl -sf -d '{"jsonrpc":"2.0","method":"optimism_version","params":[],"id":1}' http://localhost:9545 -H 'Content-Type: application/json') || exit 1

RESULT=$(echo $VERSION | jq -r '.result')

if [[ result != "" ]]; then
  echo "op-node started"
  exit 0
fi

echo "op-node not started"
exit 1