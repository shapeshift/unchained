#!/bin/bash

DISABLE_LIVENESS_PROBE=/data/disable_liveness

if [[ -f "$DISABLE_LIVENESS_PROBE" ]]; then
  echo "liveness probe disabled"
  exit 0
fi

FILE=/data/.block_number

ETH_BLOCK_NUMBER=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:8547) || exit 1

CURRENT_BLOCK_NUMBER_HEX=$(echo $ETH_BLOCK_NUMBER | jq -r '.result')
CURRENT_BLOCK_NUMBER=$(($CURRENT_BLOCK_NUMBER_HEX))

if [[ ! -f "$FILE" ]]; then
  echo $CURRENT_BLOCK_NUMBER > $FILE
  exit 1
fi

PREVIOUS_BLOCK_NUMBER=$(cat $FILE)
echo $CURRENT_BLOCK_NUMBER > $FILE

if (( $CURRENT_BLOCK_NUMBER > $PREVIOUS_BLOCK_NUMBER )); then
  echo "daemon is running"
  exit 0
fi

echo "daemon is stalled"
exit 1