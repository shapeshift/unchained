#!/bin/bash

IN_SYNC=$(curl -s http://localhost:8080/v2/health | jq .inSync)

if [[ $IN_SYNC != "true" ]]; then
  echo "midgard is still syncing"
  exit 1
fi

echo "midgard is synced"
exit 0
