#!/bin/sh

set -e

export USING_OVM=true
export ETH1_SYNC_SERVICE_ENABLE=false

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/geth/chaindata

if [[ ! -d "$CHAINDATA_DIR" ]]; then
  wget -c $SNAPSHOT -O - | tar -xvf - -C $DATA_DIR
fi

start() {
  geth \
    --datadir=$DATA_DIR \
    --networkid=420 \
    --port=20303 \
    --rpc \
    --rpcport=7545 \
    --rpcaddr=0.0.0.0 \
    --rpcapi=eth,rollup,net,web3,debug \
    --rpcvhosts="*" \
    --rpccorsdomain="*" \
    --ws \
    --wsport=7546 \
    --wsaddr=0.0.0.0 \
    --wsapi=eth,rollup,net,web3,debug \
    --wsorigins="*" \
    --nousb \
    --ipcdisable \
    --nat=none \
    --nodiscover &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
