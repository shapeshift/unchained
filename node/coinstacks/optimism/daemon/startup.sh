#!/bin/bash

NET_LISTENING=$(curl -sf -d '{"jsonrpc":"2.0","method":"net_listening","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json') || exit 1

LISTENING=$(echo $NET_LISTENING | jq -r '.result')

if [[ $LISTENING == true ]]; then
  echo "daemon is listening"
  exit 0
fi

echo "daemon is not listening"
exit 1
