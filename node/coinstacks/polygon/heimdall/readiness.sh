#!/bin/bash

DISABLE_READINESS_PROBE=/root/disable_readiness

if [[ -f "$DISABLE_READINESS_PROBE" ]]; then
  echo "readiness probe disabled"
  exit 0
fi

SYNCING=$(curl -sf http://localhost:1317/syncing) || exit 1
NET_INFO=$(curl -sf http://localhost:26657/net_info) || exit 1
STATUS=$(curl -sf http://localhost:26657/status) || exit 1

IS_SYNCING=$(echo $SYNCING | jq -r '.syncing')
CATCHING_UP=$(echo $STATUS | jq -r '.result.sync_info.catching_up')
NUM_PEERS=$(echo $NET_INFO | jq -r '.result.n_peers')

if [[ $IS_SYNCING == false && $CATCHING_UP == false ]]; then
  if (( $NUM_PEERS > 0 )); then
    echo "heimdall is synced with $NUM_PEERS peers"
    exit 0
  fi

  echo "heimdall is synced, but has no peers"
  exit 1
fi

echo "heimdall is still syncing"
exit 1
