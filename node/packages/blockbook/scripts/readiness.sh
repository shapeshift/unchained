#!/bin/sh

IN_SYNC=$(curl -s --connect-timeout 10 http://localhost:8001/api/v2 -H 'Content-Type: application/json')
IN_SYNC_RESULT=$(echo "$IN_SYNC" | jq -r .blockbook.inSync)

if [ "$IN_SYNC_RESULT" = "true" ]; then
    echo "Blockbook is synced"
    exit 0
elif [ "$IN_SYNC_RESULT" = "false" ]; then
    echo "Blockbook is still syncing"
    exit 1
else
    echo "Blockbook error: ${IN_SYNC}"
    exit 1
fi