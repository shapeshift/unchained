#!/bin/bash

DISABLE_STARTUP_PROBE=/data/disable_startup

if [[ -f "$DISABLE_STARTUP_PROBE" ]]; then
  echo "startup probe disabled"
  exit 0
fi

NET_LISTENING=$(curl -sf -d '{"jsonrpc":"2.0","method":"net_listening","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:8545) || exit 1

LISTENING=$(echo $NET_LISTENING | jq -r '.result')

if [[ $LISTENING == true ]]; then
  echo "daemon is listening"
  exit 0
fi

echo "daemon is not listening"
exit 1
