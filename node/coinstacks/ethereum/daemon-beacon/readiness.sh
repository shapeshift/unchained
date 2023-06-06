#!/bin/bash

ETH_SYNCING=$(curl -s http://localhost:3500/eth/v1/node/syncing)
SYNCING_RESULT=$(echo "$ETH_SYNCING" | jq -r .data.is_syncing)

if [[ $SYNCING_RESULT == "false" ]]; then
  echo "node is synced"
else
  echo "node is still syncing"
  exit 1
fi
