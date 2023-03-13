#!/bin/bash

SYNCING=$(curl -s -d '{"jsonrpc":"2.0", "id":1, "method":"eth_syncing", "params":[]}' -H 'Content-Type:application/json;' http://localhost:8545 | jq -r .result)
PEER_COUNT=$(curl -s -d '{"jsonrpc":"2.0", "id":1, "method":"net_peerCount", "params":[]}' -H 'Content-Type:application/json;' http://localhost:8545 | jq -r .result)

if [ "$SYNCING" == "false" ]; then
  # Make sure we have peers
  if [ "$PEER_COUNT" == "0" ]; then
    echo "node is synced, but has 0 peer connections"
    exit 1
  fi

  echo "node is synced, with $PEER_COUNT peers"
  exit 0
fi

echo "node is still syncing"
exit 1
