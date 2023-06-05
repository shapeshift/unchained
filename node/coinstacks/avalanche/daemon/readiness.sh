#!/bin/bash

SYNCING=$(curl -X POST --data '{"jsonrpc":"2.0", "id":1, "method":"eth_syncing", "params":[]}' -H 'Content-Type:application/json;' http://localhost:9650/ext/bc/C/rpc | jq -r .result)
PEER_COUNT=$(curl -X POST --data '{"jsonrpc":"2.0", "id":1, "method":"info.peers", "params":[]}' -H 'Content-Type:application/json;' http://localhost:9650/ext/info | jq -r .result.numPeers)

if [[ $SYNCING = "false" ]]; then
  # Make sure we have peers
  if [[ $PEER_COUNT = "0" ]]; then
    echo "node is synced, but has 0 peer connections"
    exit 1
  fi

  echo "node is synced, with $PEER_COUNT peers"
  exit 0
fi

echo "node is still syncing"
exit 1
