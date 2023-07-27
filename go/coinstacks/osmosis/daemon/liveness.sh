#!/bin/bash

FILE=/root/.osmosisd/.latest_block_height

STATUS=$(curl -sf http://localhost:26657/status) || exit 1

LATEST_BLOCK_HEIGHT=$(echo $STATUS | jq -r '.result.sync_info.latest_block_height')

if [[ ! -f "$FILE" ]]; then
  echo $LATEST_BLOCK_HEIGHT > $FILE
  exit 1
fi

PREV_LATEST_BLOCK_HEIGHT=$(cat $FILE)
echo $LATEST_BLOCK_HEIGHT > $FILE

if [[ $LATEST_BLOCK_HEIGHT -gt $PREV_LATEST_BLOCK_HEIGHT ]]; then
  exit 0
fi

echo "node is stalled... (PREV_LATEST_BLOCK_HEIGHT: $PREV_LATEST_BLOCK_HEIGHT, LATEST_BLOCK_HEIGHT: $LATEST_BLOCK_HEIGHT)"

exit 1