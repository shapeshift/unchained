#!/bin/bash

TOLERANCE=1

PEERS=$(curl -s -H 'content-type: application/json' -u user:password  -d '{ "jsonrpc": "1.0", "id": "probe", "method": "getconnectioncount", "params": [] }' http://localhost:8332 | jq .result)
BLOCKCHAIN_INFO=$(curl -s -H 'content-type: application/json' -u user:password  -d '{ "jsonrpc": "1.0", "id": "probe", "method": "getblockchaininfo", "params": [] }' http://localhost:8332 | jq .result)
BLOCKS=$(echo $BLOCKCHAIN_INFO | jq .blocks)
HEADERS=$(echo $BLOCKCHAIN_INFO | jq .headers)

if [[ $PEERS -le 0 ]]; then
  echo "no peer connections"
  exit 1
fi

NOMINAL_BLOCKS=$(( $BLOCKS + $TOLERANCE ))
if [[ $HEADERS -gt $NOMINAL_BLOCKS ]]; then
  echo "node is still syncing"
  exit 1
fi

echo "node is synced"
exit 0