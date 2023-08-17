#!/bin/bash

DISABLE_READINESS_PROBE=/data/disable_readiness

if [[ -f "$DISABLE_READINESS_PROBE" ]]; then
  echo "readiness probe disabled"
  exit 0
fi

source /evm.sh

BLOCK_HEIGHT_TOLERANCE=5

SYNC_STATUS=$(curl -s -d '{"jsonrpc":"2.0","method":"optimism_syncStatus","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:9545)

QUEUED_UNSAFE_L2_HEIGHT=$(echo $SYNC_STATUS | jq -r .result.queued_unsafe_l2.number)

if (( $QUEUED_UNSAFE_L2_HEIGHT == 0 )); then
  current_l1_block_number=$(echo $SYNC_STATUS | jq -r .result.current_l1.number)
  best_reference_block_number=$(get_best_reference_block_number $L1_RPC_ENDPOINT https://ethereum.publicnode.com https://eth-mainnet.g.alchemy.com/v2/demo)

  reference_validation op-node $current_l1_block_number $best_reference_block_number $BLOCK_HEIGHT_TOLERANCE

  echo "op-node is synced"
  exit 0
fi

echo "op-node is still syncing"
exit 1