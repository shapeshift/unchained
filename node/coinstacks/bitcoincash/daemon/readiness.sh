#!/bin/bash

TOLERANCE=1

BLOCKHEIGHT_LOCAL=$(curl -s -H 'content-type: application/json' -u user:password  -d '{ "jsonrpc": "1.0", "id": "getinfo", "method": "getblockchaininfo", "params": [] }' http://localhost:8332 | jq .result.blocks)
BLOCKHEIGHT_REMOTE_SOURCE_1=$(curl -s https://api.blockchair.com/bitcoin-cash/stats | jq .data.blocks)

ARRAY=($BLOCKHEIGHT_REMOTE_SOURCE_1)
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
