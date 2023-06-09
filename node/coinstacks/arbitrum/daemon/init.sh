#!/bin/sh

set -x

SNAPSHOT_URL="https://snapshot.arbitrum.io/mainnet/nitro.tar"
SNAPSHOT_FILE="/home/user/nitro.tar"
EXPECTED_CHECKSUM="a609773c6103435b8a04d32c63f42bb5fa0dc8fc38a2acee4d2ab2d05880205c"

function downloadSnapshot() {
    wget -nc --timeout 0 --retry-connrefused $SNAPSHOT_URL -O $SNAPSHOT_FILE
}

# If the file doesn't exist
if [ -n "$SNAPSHOT_FILE" ]; then
  downloadSnapshot
fi

# If the checksum doesn't match, redownload the file
ACTUAL_CHECKSUM=$(md5sum "$SNAPSHOT_FILE" | awk '{ print $1 }')
if [ "$ACTUAL_CHECKSUM" != "$EXPECTED_CHECKSUM" ]; then
  echo "Invalid checksum, redownloading the snapshot"
  rm -f $SNAPSHOT_FILE
  downloadSnapshot
else
  echo "File is valid"
fi


# docker run --rm -it  -v /some/local/dir/arbitrum:/home/user/.arbitrum -p 0.0.0.0:8547:8547 -p 0.0.0.0:8548:8548 offchainlabs/nitro-node:v2.0.14-2baa834 --l1.url https://l1-node:8545 --l2.chain-id=<L2ChainId> --http.api=net,web3,eth,debug --http.corsdomain=* --http.addr=0.0.0.0 --http.vhosts=*

start() {
  /usr/local/bin/nitro \
  --init.url="file://${SNAPSHOT_FILE}" \
  --http.addr 0.0.0.0 \
  --http.port 8545 \
  --http.api eth,net,web3,debug,txpool,parlia \
  --http.vhosts '*' \
  --http.corsdomain '*' \
  --l1.url http://ethereum-svc.unchained-dev.svc.cluster.local:8332 \
  --l2.chain-id=42161 \
  --http.api=net,web3,eth,debug \
  --http.corsdomain=* \
  --http.addr=0.0.0.0 \
  --http.vhosts=* &
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID