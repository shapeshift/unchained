#!/bin/sh

ETH_SYNCING=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' http://localhost:8332 -H 'Content-Type: application/json')
ETH_PEER=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' http://localhost:8332 -H 'Content-Type: application/json')
SYNCING_RESULT=$(echo "$ETH_SYNCING" | jq -r .result)
PEER_RESULT=$(echo "$ETH_PEER" | jq -r .result)

if [ "$SYNCING_RESULT" == "false" ]; then
  # Make sure we have peers
  if [ "$PEER_RESULT" != "0x0" ]; then
    echo "$NODE is ready to start accepting traffic, with $PEER_RESULT peers"
    exit 0
  else
    echo "$NODE is reporting synced, however it has 0 peer connections"
    exit 1
  fi
else
  echo "$NODE is still syncing the blockchain"
  exit 1
fi;
