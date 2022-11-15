#!/bin/bash

SYNCING=$(curl -s http://localhost:1317/syncing | jq -r .syncing)

if [ $SYNCING == "false" ]; then
  echo "node is synced"
  exit 0
fi

echo "node is still syncing"
exit 1
