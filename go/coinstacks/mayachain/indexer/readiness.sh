#!/bin/bash

HEALTH=$(curl -sf http://localhost:8080/v2/health) || exit 1

IN_SYNC=$(echo $HEALTH | jq -r '.inSync')

if [[ $IN_SYNC == true ]]; then
  echo "midgard is synced"
  exit 0
fi

echo "midgard is still syncing"
exit 1
