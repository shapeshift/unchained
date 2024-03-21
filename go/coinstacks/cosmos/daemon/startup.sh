#!/bin/bash

DISABLE_STARTUP_PROBE=/root/disable_startup

if [[ -f "$DISABLE_STARTUP_PROBE" ]]; then
  echo "startup probe disabled"
  exit 0
fi

curl -sf http://localhost:26657/status && exit 0 || exit 1