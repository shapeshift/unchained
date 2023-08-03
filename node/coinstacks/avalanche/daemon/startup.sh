#!/bin/bash

NET_LISTENING=$(curl -sf -d '{"jsonrpc":"2.0","method":"net_listening","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:9650/ext/bc/C/rpc) || exit 1
INFO_PEERS=$(curl -sf -d '{"jsonrpc":"2.0","method":"info.peers","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:9650/ext/info) || exit 1

LISTENING=$(echo $NET_LISTENING | jq -r '.result')
NUM_PEERS=$(echo $INFO_PEERS | jq -r '.result.numPeers')

if [[ $LISTENING == true ]]; then
  if (( $NUM_PEERS > 0 )); then
    echo "daemon is listening, with $NUM_PEERS peers"
    exit 0
  fi

  echo "daemon is listening, but has no peers"
  exit 1
fi

echo "daemon is not listening"
exit 1
