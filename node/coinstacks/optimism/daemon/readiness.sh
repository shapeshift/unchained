#!/bin/sh

TARGET_HEIGHT_HEX=$(curl -s -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' https://opt-mainnet.g.alchemy.com/v2/Im6I9y7QNPR3v5kaj73xrm4F99mcuFvG -H 'Content-Type: application/json' | jq -r .result)
LOCAL_HEIGHT_HEX=$(curl -s -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 -H 'Content-Type: application/json' | jq -r .result)
TARGET_HEIGHT=$(echo $(($TARGET_HEIGHT_HEX)))
LOCAL_HEIGHT=$(echo $(($LOCAL_HEIGHT_HEX)))
NOMINAL_HEIGHT=$((TARGET_HEIGHT-10))

if [ "$LOCAL_HEIGHT" -ge "$NOMINAL_HEIGHT" ]; then
  echo "node is synced"
  exit 0
fi

echo "node is still syncing"
exit 1
