#!/bin/bash

SYNCING=$(curl -s -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json' | jq -r .result)

if [[ $SYNCING == "false" ]]; then
  echo "node is synced"
  exit 0
fi

echo "node is still syncing"
exit 1