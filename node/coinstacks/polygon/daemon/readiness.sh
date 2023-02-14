#!/bin/sh

SYNCING=$(curl -s -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json' | jq -r .result)
PEER_COUNT=$(curl -s -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json' | jq -r .result)

if [ "$SYNCING" == "false" ]; then
  # Make sure we have peers
  if [ "$PEER_COUNT" == "0x0" ]; then
    echo "node is synced, but has 0 peer connections"
    exit 1
  else
    echo "node is synced, with $PEER_COUNT peers"
    exit 0
  fi
fi

echo "node is still syncing"
exit 1
