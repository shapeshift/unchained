#!/bin/bash

source /evm.sh

BLOCK_HEIGHT_TOLERANCE=15

ETH_SYNCING=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json') || exit 1
NET_PEER_COUNT=$(curl -sf -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json') || exit 1

SYNCING=$(echo $ETH_SYNCING | jq -r '.result')
PEER_COUNT_HEX=$(echo $NET_PEER_COUNT | jq -r '.result')
PEER_COUNT=$(($PEER_COUNT_HEX))

if [[ $SYNCING == false ]]; then
  if (( $PEER_COUNT > 0 )); then
    eth_blockNumber=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:8545) || exit 1
    current_block_number_hex=$(echo $eth_blockNumber | jq -r '.result')
    current_block_number=$(($current_block_number_hex))

    best_reference_block_number=$(get_best_reference_block_number https://polygon-rpc.com https://polygon-bor.publicnode.com https://polygon-mainnet.g.alchemy.com/v2/demo)

    # if node is reporting synced, double check against reference nodes
    reference_validation daemon $current_block_number $best_reference_block_number $BLOCK_HEIGHT_TOLERANCE

    echo "daemon is synced, with $PEER_COUNT peers"
    exit 0
  fi

  echo "daemon is synced, but has no peers"
  exit 1
fi

echo "daemon is still syncing"
exit 1
