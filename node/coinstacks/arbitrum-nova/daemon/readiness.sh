#!/bin/bash

DISABLE_READINESS_PROBE=/data/disable_readiness

if [[ -f "$DISABLE_READINESS_PROBE" ]]; then
  echo "readiness probe disabled"
  exit 0
fi

source /evm.sh

BLOCK_HEIGHT_TOLERANCE=15

ETH_SYNCING=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:8547) || exit 1

SYNCING=$(echo $ETH_SYNCING | jq -r '.result')

if [[ $SYNCING == false ]]; then
  eth_blockNumber=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:8547) || exit 1
  current_block_number_hex=$(echo $eth_blockNumber | jq -r '.result')
  current_block_number=$(($current_block_number_hex))
  
  best_reference_block_number=$(get_best_reference_block_number https://nova.arbitrum.io/rpc https://arbitrum-nova.publicnode.com)
  
  # if node is reporting synced, double check against reference nodes
  reference_validation daemon $current_block_number $best_reference_block_number $BLOCK_HEIGHT_TOLERANCE
fi

echo "daemon is still syncing"
exit 1
