#!/bin/bash

SYNCING=$(curl -sf http://localhost:3500/eth/v1/node/syncing) || exit 1
IS_SYNCING=$(echo "$SYNCING" | jq -r '.data.is_syncing')

if [[ $IS_SYNCING == false ]]; then
  echo "daemon-beacon is synced"
  exit 0
fi

echo "daemon-beacon is still syncing"
exit 1