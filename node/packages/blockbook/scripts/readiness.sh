#!/bin/bash

STATUS=$(curl -sf http://localhost:8001/api/v2) || exit 1
IN_SYNC=$(echo $STATUS | jq -r '.blockbook.inSync')

if [[ $IN_SYNC == "true" ]]; then
    echo "blockbook is synced"
    exit 0
fi

echo "blockbook is still syncing"
exit 1