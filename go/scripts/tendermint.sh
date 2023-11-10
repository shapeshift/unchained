#!/bin/bash

get_best_reference_block_height() {
  local best_reference_block_height=0

  for reference_url in "$@"; do
    local status=$(curl -sf -m 3 $reference_url/status)

    if [[ $status != "" ]]; then
      local latest_block_height=$(echo $status | jq -r '.result.sync_info.latest_block_height')

      if (( $latest_block_height > $best_reference_block_height )); then
        best_reference_block_height=$latest_block_height
      fi
    fi
  done

  echo $best_reference_block_height
}

get_best_reference_block_height_eval() {
  local best_reference_block_height=0

  for status_curl in "$@"; do
    local status=$(eval "$status_curl")

    if [[ $status != "" ]]; then
      local latest_block_height=$(echo $status | jq -r '.result.sync_info.latest_block_height')

      if (( $latest_block_height > $best_reference_block_height )); then
        best_reference_block_height=$latest_block_height
      fi
    fi
  done

  echo $best_reference_block_height
}

reference_validation() {
  local latest_block_height=$1
  local best_reference_block_height=$2
  local block_height_tolerance=$3

  if (( $best_reference_block_height > 0 )); then
    local nominal_block_height=$(( $best_reference_block_height - $block_height_tolerance ))

    if (( $latest_block_height >= $nominal_block_height )); then
      echo "daemon is synced and within block height tolerance of reference node"
      exit 0
    fi

    echo "daemon is synced, but not within block height tolerance of reference node"
    exit 1
  fi
}