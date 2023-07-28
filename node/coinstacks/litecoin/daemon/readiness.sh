#!/bin/bash

TOLERANCE=1

CONNECTION_COUNT=$(curl -sf -H 'content-type: application/json' -u user:password -d '{ "jsonrpc": "2.0", "id": "probe", "method": "getconnectioncount", "params": [] }' http://localhost:8332) || exit 1
BLOCKCHAIN_INFO=$(curl -sf -H 'content-type: application/json' -u user:password -d '{ "jsonrpc": "2.0", "id": "probe", "method": "getblockchaininfo", "params": [] }' http://localhost:8332) || exit 1

PEERS=$(echo $CONNECTION_COUNT | jq -r '.result')
NODE_LATEST_BLOCK_HEIGHT=$(echo $BLOCKCHAIN_INFO | jq -r '.result.blocks')
NETWORK_LATEST_BLOCK_HEIGHT=$(echo $BLOCKCHAIN_INFO | jq -r '.result.headers')

NOMINAL_BLOCKS=$(( $NETWORK_LATEST_BLOCK_HEIGHT - $TOLERANCE ))

if (( $NODE_LATEST_BLOCK_HEIGHT >= $NOMINAL_BLOCKS )); then
  if (( $PEERS > 0 )); then
    echo "node is synced with $PEERS peers"
    exit 0
  fi

  echo "node is synced, but has no peers"
  exit 1
fi

echo "node is still syncing"
exit 1