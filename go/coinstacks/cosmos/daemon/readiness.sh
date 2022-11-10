#!/bin/bash

SYNCING=$(curl -sf http://localhost:1317/syncing | jq -r .syncing)

if [ $SYNCING == "true" ]; then
  echo "node is still syncing"
  exit 1
fi

echo "node is synced"
exit 0
