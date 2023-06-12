#!/bin/bash

set -e

SYNCING=$(curl -s -d '{"jsonrpc":"2.0", "id":1, "method":"eth_syncing", "params":[]}' -H 'Content-Type:application/json;' http://localhost:8545 | jq -r .result)

# check if node is reporting it is synced
if [[ $SYNCING == "false" ]]; then

  TARGET_HEIGHT_HEX=$(curl -s -d '{"jsonrpc":"2.0", "id":1, "method":"eth_blockNumber", "params":[]}' -H 'Content-Type:application/json;' https://arb1.arbitrum.io/rpc/ | jq -r .result)
  TARGET_HEIGHT=$(echo $(($TARGET_HEIGHT_HEX)))
  LOCAL_HEIGHT_HEX=$(curl -s -d '{"jsonrpc":"2.0", "id":1, "method":"eth_blockNumber", "params":[]}' -H 'Content-Type:application/json;' http://localhost:8545 | jq -r .result)
  LOCAL_HEIGHT=$(echo $(($LOCAL_HEIGHT_HEX)))
  NOMINAL_HEIGHT=$((TARGET_HEIGHT-5))

  # the node can incorrectly report it is synced after catch up, but then falling back out of sync
  # validate against a public reference node to confirm sync status
  if [[ $LOCAL_HEIGHT -ge $NOMINAL_HEIGHT ]]; then
    echo "node is synced"
    exit 0
  else
    echo "node is reporting synced, but is behind public reference node (Local: $LOCAL_HEIGHT, Reference: $TARGET_HEIGHT)"
    exit 1
  fi
fi

echo "node is still syncing"
exit 1
