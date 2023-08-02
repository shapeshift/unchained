#!/bin/bash

FILE=/data/bor/.block_number

ETH_BLOCK_NUMBER=$(curl -sf -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json') || exit 1

CURRENT_BLOCK_NUMBER_HEX=$(echo $ETH_BLOCK_NUMBER | jq -r '.result')
CURRENT_BLOCK_NUMBER=$(($CURRENT_BLOCK_NUMBER_HEX))

if [[ ! -f "$FILE" ]]; then
  echo $CURRENT_BLOCK_NUMBER > $FILE
  exit 1
fi

PREVIOUS_BLOCK_NUMBER=$(cat $FILE)
echo $CURRENT_BLOCK_NUMBER > $FILE

if (( $CURRENT_BLOCK_NUMBER > $PREVIOUS_BLOCK_NUMBER )); then
  exit 0
fi

echo "daemon is stalled..."
exit 1