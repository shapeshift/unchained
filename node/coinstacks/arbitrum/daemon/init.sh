#!/bin/sh

set -x
set -e

SNAPSHOT_URL="https://snapshot.arbitrum.io/mainnet/nitro.tar"
SNAPSHOT_FILE="/home/user/.arbitrum/nitro.tar"
EXPECTED_CHECKSUM="a609773c6103435b8a04d32c63f42bb5fa0dc8fc38a2acee4d2ab2d05880205c"

# If the file doesn't exist
if [ -n "$SNAPSHOT_FILE" ]; then
  curl -o $SNAPSHOT_FILE -L -O --retry 999 --retry-max-time 0 -C - $SNAPSHOT_URL
fi

# If the checksum doesn't match, redownload the file
ACTUAL_CHECKSUM=$(md5sum "$SNAPSHOT_FILE" | awk '{ print $1 }')
while [ "$ACTUAL_CHECKSUM" != "$EXPECTED_CHECKSUM" ]; then
  echo "Invalid checksum, redownloading the snapshot"
  curl -o $SNAPSHOT_FILE -L -O --retry 999 --retry-max-time 0 -C - $SNAPSHOT_URL
else
  echo "File is valid"
fi


# docker run --rm -it  -v /some/local/dir/arbitrum:/home/user/.arbitrum -p 0.0.0.0:8547:8547 -p 0.0.0.0:8548:8548 offchainlabs/nitro-node:v2.0.14-2baa834 --l1.url https://l1-node:8545 --l2.chain-id=<L2ChainId> --http.api=net,web3,eth,debug --http.corsdomain=* --http.addr=0.0.0.0 --http.vhosts=*

start() {
  /usr/local/bin/nitro \
  --init.url="file://${SNAPSHOT_FILE}" \
  --http.addr 0.0.0.0 \
  --http.port 8545 \
  --http.api eth,net,web3,debug,txpool,arb,parlia \
  --http.vhosts '*' \
  --http.corsdomain '*' \
  --l1.url $L1_RPC_ENDPOINT \
  --l2.chain-id=42161 \
  --healthcheck.enable \
  --ws \
  --ws.addr 0.0.0.0 \
  --ws.api eth,net,web3,debug,txpool,bor \
  --ws.origins '*' \
  --http.vhosts=* &
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID