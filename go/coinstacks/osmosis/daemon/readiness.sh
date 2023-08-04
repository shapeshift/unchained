#!/bin/bash

source /tendermint.sh

BLOCK_HEIGHT_TOLERANCE=5

SYNCING=$(curl -sf http://localhost:1317/syncing) || exit 1
NET_INFO=$(curl -sf http://localhost:26657/net_info) || exit 1
STATUS=$(curl -sf http://localhost:26657/status) || exit 1

IS_SYNCING=$(echo $SYNCING | jq -r '.syncing')
CATCHING_UP=$(echo $STATUS | jq -r '.result.sync_info.catching_up')
NUM_PEERS=$(echo $NET_INFO | jq -r '.result.n_peers')

if [[ $IS_SYNCING == false && $CATCHING_UP == false ]]; then
  if (( $NUM_PEERS > 0 )); then
    latest_block_height=$(echo $STATUS | jq -r '.result.sync_info.latest_block_height')
    best_reference_block_height=$(get_best_reference_block_height https://rpc.osmosis.zone https://osmosis-rpc.polkachu.com https://rpc-osmosis.keplr.app)

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
