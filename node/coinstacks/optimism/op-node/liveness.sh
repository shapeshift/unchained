#!/bin/bash

FILE=/data/.block_number

SYNC_STATUS=$(curl -sf -d '{"jsonrpc":"2.0","method":"optimism_syncStatus","params":[],"id":1}' http://localhost:9545 -H 'Content-Type: application/json') || exit 1

CURRENT_L1_BLOCK_NUMBER=$(echo $SYNC_STATUS | jq -r .result.current_l1.number)
CURRENT_L2_BLOCK_NUMBER=$(echo $SYNC_STATUS | jq -r .result.unsafe_l2.number)

JSON="{\"l1\": $CURRENT_L1_BLOCK_NUMBER, \"l2\": $CURRENT_L2_BLOCK_NUMBER}"

if [[ ! -f "$FILE" ]]; then
  echo $JSON > $FILE
  exit 1
fi

PREVIOUS_L1_BLOCK_NUMBER=$(cat $FILE | jq -r '.l1')
PREVIOUS_L2_BLOCK_NUMBER=$(cat $FILE | jq -r '.l2')

echo $JSON > $FILE

if (( $CURRENT_L1_BLOCK_NUMBER > $PREVIOUS_L1_BLOCK_NUMBER && $CURRENT_L2_BLOCK_NUMBER > $PREVIOUS_L2_BLOCK_NUMBER )); then
  echo "op-node is running"
  exit 0
fi

echo "op-node is stalled"
exit 1