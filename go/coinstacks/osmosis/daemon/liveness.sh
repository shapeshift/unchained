#!/bin/bash

FILE=/root/.latest_block_height

STATUS=$(curl -sf http://localhost:26657/status) || exit 1

LATEST_BLOCK_HEIGHT=$(echo $STATUS | jq -r '.result.sync_info.latest_block_height')

if [[ ! -f "$FILE" ]]; then
  echo $LATEST_BLOCK_HEIGHT > $FILE
  exit 1
fi

PREVIOUS_BLOCK_HEIGHT=$(cat $FILE)
echo $LATEST_BLOCK_HEIGHT > $FILE

if (( $LATEST_BLOCK_HEIGHT > $PREVIOUS_BLOCK_HEIGHT )); then
  echo "daemon is running"
  exit 0
fi

echo "daemon is stalled"
exit 1