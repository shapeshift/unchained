#!/bin/bash

BLOCK_HEIGHT_TOLERANCE=15

ETH_SYNCING=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json') || exit 1
NET_PEER_COUNT=$(curl -sf -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json') || exit 1

SYNCING=$(echo $ETH_SYNCING | jq -r '.result')
PEER_COUNT_HEX=$(echo $NET_PEER_COUNT | jq -r '.result')
PEER_COUNT=$(($PEER_COUNT_HEX))

get_best_block_number() {
  local best_block_number=0

  for reference_url in "$@"; do
    local eth_blockNumber=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H 'Content-Type: application/json' $reference_url)

    if [[ $eth_blockNumber != "" ]]; then
      local current_block_number_hex=$(echo $eth_blockNumber | jq -r '.result')
      local current_block_number=$(($current_block_number_hex))

      if (( $current_block_number > $best_block_number )); then
        best_block_number=$current_block_number
      fi
    fi
  done

  echo $best_block_number
}

reference_validation() {
  local best_block_number=$(get_best_block_number https://polygon-rpc.com https://polygon-bor.publicnode.com https://polygon-mainnet.g.alchemy.com/v2/demo)
  local eth_blockNumber=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:8545) || exit 1
  local current_block_number_hex=$(echo $eth_blockNumber | jq -r '.result')
  local current_block_number=$(($current_block_number_hex))

  if (( $best_block_number > 0 )); then
    local nominal_block_number=$(( $best_block_number - $BLOCK_HEIGHT_TOLERANCE ))

    if (( $current_block_number >= $nominal_block_number )); then
      echo "node is synced with $PEER_COUNT and within block height tolerance of reference node"
      exit 0
    fi

    echo "node is synced with $PEER_COUNT peers, but not within block height tolerance of reference node"
    exit 1
  fi
}

if [[ $SYNCING == false ]]; then
  if (( $PEER_COUNT > 0 )); then
    # if node is reporting synced, double check against reference nodes
    reference_validation

    echo "node is synced, with $PEER_COUNT peers"
    exit 0
  fi

  echo "node is synced, but has no peers"
  exit 1
fi

echo "node is still syncing"
exit 1
