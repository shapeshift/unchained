#!/bin/bash

get_best_reference_block_number() {
  local best_reference_block_number=0

  for reference_url in "$@"; do
    local eth_blockNumber=$(curl -sf -m 3 -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H 'Content-Type: application/json' $reference_url)

    if [[ $eth_blockNumber != "" ]]; then
      local current_block_number_hex=$(echo $eth_blockNumber | jq -r '.result')
      local current_block_number=$(($current_block_number_hex))

      if (( $current_block_number > $best_reference_block_number )); then
        best_reference_block_number=$current_block_number
      fi
    fi
  done

  echo $best_reference_block_number
}

reference_validation() {
  local service=$1
  local current_block_number=$2
  local best_reference_block_number=$3
  local block_height_tolerance=$4

  if (( $best_reference_block_number > 0 )); then
    local nominal_block_number=$(( $best_reference_block_number - $block_height_tolerance ))

    if (( $current_block_number >= $nominal_block_number )); then
      echo "$service is synced within block height tolerance of reference node"
      exit 0
    fi

    echo "$service is synced, but not within block height tolerance of reference node"
    exit 1
  fi
}