#!/bin/bash

TOLERANCE=2

BLOCKHEIGHT_LOCAL=$(curl -s http://localhost:27147/status | jq '.result.sync_info.latest_block_height | tonumber')
BLOCKHEIGHT_REMOTE_SOURCE_1=$(curl -s https://rpc.ninerealms.com/status | jq '.result.sync_info.latest_block_height | tonumber')
BLOCKHEIGHT_REMOTE_SOURCE_2=$(curl -s https://rpc.thorchain.info/status | jq '.result.sync_info.latest_block_height | tonumber')

ARRAY=($BLOCKHEIGHT_REMOTE_SOURCE_1 $BLOCKHEIGHT_REMOTE_SOURCE_2)
BLOCKHEIGHT_BEST=${ARRAY[0]}
for n in "${ARRAY[@]}"; do
  ((n > BLOCKHEIGHT_BEST)) && BLOCKHEIGHT_BEST=$n
done

BLOCKHEIGHT_NOMINAL=$(( $BLOCKHEIGHT_LOCAL + $TOLERANCE ))
if [[ $BLOCKHEIGHT_BEST -gt $BLOCKHEIGHT_NOMINAL ]]; then
  echo "node is still syncing"
  exit 1
fi

echo "node is synced"
exit 0
