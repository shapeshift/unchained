#!/bin/bash

BLOCK_HEIGHT_BUFFER=5

SYNCING=$(curl -sf http://localhost:1317/syncing) || exit 1
NET_INFO=$(curl -sf http://localhost:26657/net_info) || exit 1
STATUS=$(curl -sf http://localhost:26657/status) || exit 1

IS_SYNCING=$(echo $SYNCING | jq -r .syncing)
CATCHING_UP=$(echo $STATUS | jq -r '.result.sync_info.catching_up')
NUM_PEERS=$(echo $NET_INFO | jq -r '.result.n_peers')

get_best_block_height() {
  local best_block_height=0

  for reference_url in "$@"; do
    local status=$(curl -sf $reference_url)

    if [[ $status != "" ]]; then
      local latest_block_height=$(echo $status | jq -r '.result.sync_info.latest_block_height')

      if (( latest_block_height > best_block_height )); then
        best_block_height=$latest_block_height
      fi
    fi
  done

  echo $best_block_height
}

reference_validation() {
  BEST_BLOCK_HEIGHT=$(get_best_block_height https://rpc.osmosis.zone/status https://rpc-osmosis.keplr.app/status)
  LATEST_BLOCK_HEIGHT=$(echo $STATUS | jq -r '.result.sync_info.latest_block_height')

  if (( BEST_BLOCK_HEIGHT > 0 )); then
    BEST_BLOCK_HEIGHT_WITH_BUFFER=$(( BEST_BLOCK_HEIGHT - BLOCK_HEIGHT_BUFFER ))

    if (( LATEST_BLOCK_HEIGHT >= BEST_BLOCK_HEIGHT_WITH_BUFFER )); then
      echo "node is synced with $NUM_PEERS and within safe buffer of reference node"
      exit 0
    fi

    echo "node is synced with $NUM_PEERS peers, but not within safe buffer of reference node"
    exit 1
  fi 
}

if [[ $IS_SYNCING == false && $CATCHING_UP == false ]]; then
  if (( $NUM_PEERS > 0 )); then
    # if node is reporting synced, double check against reference nodes
    reference_validation

    echo "node is synced with $NUM_PEERS peers"
    exit 0
  fi

  echo "node is synced, but has no peers"
  exit 0
fi

echo "node is still syncing"
exit 1
