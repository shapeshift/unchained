#!/bin/sh

set -x

# SNAPSHOT_URL="https://snapshot.arbitrum.io/mainnet/nitro.tar"
SNAPSHOT_URL="https://raw.githubusercontent.com/maticnetwork/install/main/bor.sh"
# SNAPSHOT_FILE="nitro.tar"
SNAPSHOT_FILE="/home/humblehound/Dev/shapeshift/unchained/node/coinstacks/arbitrum/bor.sh"

# EXPECTED_CHECKSUM="a609773c6103435b8a04d32c63f42bb5fa0dc8fc38a2acee4d2ab2d05880205c"
EXPECTED_CHECKSUM="d6f036546805d835808d060780027a8e"

function downloadSnapshot() {
  curl -o $SNAPSHOT_FILE -L -O --retry 999 --retry-max-time 0 -C - $SNAPSHOT_URL 
}

# If the file doesn't exist
if [ -n "$SNAPSHOT_FILE" ]; then
  downloadSnapshot
fi

# If the checksum doesn't match, redownload the file
ACTUAL_CHECKSUM=$(md5sum "$SNAPSHOT_FILE" | awk '{ print $1 }')
while [ "$ACTUAL_CHECKSUM" != "$EXPECTED_CHECKSUM" ]; do
  echo "Invalid checksum, redownloading the snapshot"
  curl -o $SNAPSHOT_FILE -L -O --retry 999 --retry-max-time 0 -C - $SNAPSHOT_URL
done

echo "Snaphot is valid"
