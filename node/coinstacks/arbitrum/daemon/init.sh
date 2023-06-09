#!/bin/sh

set -x

# shapshots provided by: https://snapshot.polygon.technology/
if [ -n "$SNAPSHOT" ]; then
  filename=$(echo $SNAPSHOT | awk -F/ '{print $NF}')
  if [ -f "$DATA_DIR/$filename" ] || [ ! -d "$CHAINDATA_DIR" ]; then
    apk add wget zstd
    rm -rf $DATA_DIR/bor;
    mkdir -p $CHAINDATA_DIR;
    wget $SNAPSHOT -O $DATA_DIR/$filename
    extract_files $DATA_DIR/$filename
    rm $DATA_DIR/$filename
  fi
fi

--init.url="file:///path/to/snapshot/in/container/nitro.tar"

# docker run --rm -it  -v /some/local/dir/arbitrum:/home/user/.arbitrum -p 0.0.0.0:8547:8547 -p 0.0.0.0:8548:8548 offchainlabs/nitro-node:v2.0.14-2baa834 --l1.url https://l1-node:8545 --l2.chain-id=<L2ChainId> --http.api=net,web3,eth,debug --http.corsdomain=* --http.addr=0.0.0.0 --http.vhosts=*

start() {
  /usr/local/bin/nitro \
  --init.url="https://snapshot.arbitrum.io/mainnet/nitro.tar" \
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