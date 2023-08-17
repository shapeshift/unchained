#!/bin/bash

DISABLE_READINESS_PROBE=/root/disable_readiness

if [[ ! -f "$DISABLE_READINESS_PROBE" ]]; then
  echo "readiness probe disabled"
  exit 0
fi

curl -sf http://localhost:8545/health && exit 0 || exit 1