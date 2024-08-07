#!/bin/bash

DISABLE_READINESS_PROBE=/root/disable_readiness

if [[ -f "$DISABLE_READINESS_PROBE" ]]; then
  echo "readiness probe disabled"
  exit 0
fi

source /tendermint.sh

BLOCK_HEIGHT_TOLERANCE=5

SYNCING=$(curl -sf http://localhost:1317/syncing) || exit 1
NET_INFO=$(curl -sf http://localhost:27147/net_info) || exit 1
STATUS=$(curl -sf http://localhost:27147/status) || exit 1

IS_SYNCING=$(echo $SYNCING | jq -r '.syncing')
CATCHING_UP=$(echo $STATUS | jq -r '.result.sync_info.catching_up')
NUM_PEERS=$(echo $NET_INFO | jq -r '.result.n_peers')

status_curls=(
  "curl -sf -m 3 https://rpc-v2.ninerealms.com/status"
  # referer header now required to avoid being blocked
  "curl -sf -m 3 -H \"Referer: https://app.thorswap.finance\" https://rpc-v2.thorswap.net/status"
)

if [[ $IS_SYNCING == false && $CATCHING_UP == false ]]; then
  if (( $NUM_PEERS > 0 )); then
    latest_block_height=$(echo $STATUS | jq -r '.result.sync_info.latest_block_height')
    best_reference_block_height=$(get_best_reference_block_height_eval "${status_curls[@]}")

    # if node is reporting synced, double check against reference nodes
    reference_validation $latest_block_height $best_reference_block_height $BLOCK_HEIGHT_TOLERANCE

    echo "daemon is synced with $NUM_PEERS peers"
    exit 0
  fi

  echo "daemon is synced, but has no peers"
  exit 1
fi

echo "daemon is still syncing"
exit 1
