#!/bin/bash

DISABLE_STARTUP_PROBE=/data/disable_startup

if [[ -f "$DISABLE_STARTUP_PROBE" ]]; then
  echo "startup probe disabled"
  exit 0
fi

curl -sf -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H 'Content-Type: application/json' http://localhost:8547

if [[ "$?" == 0 ]]; then
  echo "daemon is responding"
  exit 0
fi

echo "daemon is not responding"
exit 1
