#!/bin/bash

# ethereum block height
L1_HEIGHT_HEX=$(curl -s -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' $L1_RPC_ENDPOINT -H 'Content-Type: application/json' | jq -r .result)
L1_HEIGHT=$(echo $(($L1_HEIGHT_HEX)))

SYNC_STATUS=$(curl -s -d '{"jsonrpc":"2.0","method":"optimism_syncStatus","params":[],"id":1}' http://localhost:9545 -H 'Content-Type: application/json')
# op-node L1 block height
CURRENT_L1_HEIGHT=$(echo $SYNC_STATUS | jq -r .result.current_l1.number)
# op-node l2 blocks still left to sync
QUEUED_UNSAFE_L2_HEIGHT=$(echo $SYNC_STATUS | jq -r .result.queued_unsafe_l2.number)

if [[ $L1_HEIGHT -eq $CURRENT_L1_HEIGHT && QUEUED_UNSAFE_L2_HEIGHT -eq 0 ]]; then
  echo "node is synced"
  exit 0
fi

echo "node is still syncing"
exit 1