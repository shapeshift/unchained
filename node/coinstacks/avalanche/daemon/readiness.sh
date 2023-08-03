#!/bin/bash

source /evm.sh

BLOCK_HEIGHT_TOLERANCE=5

ETH_SYNCING=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' -H 'Content-Type:application/json;' http://localhost:9650/ext/bc/C/rpc) || exit 1
INFO_PEERS=$(curl -sf -d '{"jsonrpc":"2.0","method":"info.peers","params":[],"id":1}' -H 'Content-Type:application/json;' http://localhost:9650/ext/info) || exit 1

SYNCING=$(echo $ETH_SYNCING | jq -r '.result')
NUM_PEERS=$(echo $INFO_PEERS | jq -r '.result.numPeers')

if [[ $SYNCING == false ]]; then
  if (( $NUM_PEERS > 0 )); then
    eth_blockNumber=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:9650/ext/bc/C/rpc) || exit 1
    current_block_number_hex=$(echo $eth_blockNumber | jq -r '.result')
    current_block_number=$(($current_block_number_hex))

    best_reference_block_number=$(get_best_reference_block_number https://api.avax.network/ext/bc/C/rpc https://avalanche-c-chain.publicnode.com https://avalanche.public-rpc.com)

    # if node is reporting synced, double check against reference nodes
    reference_validation daemon $current_block_number $best_reference_block_number $BLOCK_HEIGHT_TOLERANCE

    echo "daemon is synced, with $NUM_PEERS peers"
    exit 0
  fi

  echo "daemon is synced, but has no peers"
  exit 1
fi

echo "daemon is still syncing"
exit 1
