#!/bin/bash

DISABLE_STARTUP_PROBE=/data/disable_startup

if [[ -f "$DISABLE_STARTUP_PROBE" ]]; then
  echo "startup probe disabled"
  exit 0
fi

NET_LISTENING=$(curl -sf -d '{"jsonrpc":"2.0","method":"net_listening","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:8545) || exit 1
NET_PEER_COUNT=$(curl -sf -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:8545) || exit 1

LISTENING=$(echo $NET_LISTENING | jq -r '.result')
PEER_COUNT_HEX=$(echo $NET_PEER_COUNT | jq -r '.result')
PEER_COUNT=$(($PEER_COUNT_HEX))

if [[ $LISTENING == true ]]; then
  if (( $PEER_COUNT > 0 )); then
    echo "daemon is listening, with $PEER_COUNT peers"
    exit 0
  fi

  echo "daemon is listening, but has no peers"
  exit 1
fi

echo "daemon is not listening"
exit 1
