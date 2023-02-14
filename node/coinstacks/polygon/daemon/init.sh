#!/bin/sh

set -e

[ "$DEBUG" == "true" ] && set -x

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/bor/chaindata

# shapshots provided by: https://snapshot.polygon.technology/
if [[ -n $SNAPSHOT && ! -d "$CHAINDATA_DIR" ]]; then
  rm -rf $DATA_DIR/bor;
  mkdir -p $CHAINDATA_DIR;
  wget -c $SNAPSHOT -O - | tar -xzf - -C $CHAINDATA_DIR
fi

if [[ ! -f "$DATA_DIR/bor/genesis.json" ]]; then
  # copy genesis file
  cp /var/lib/bor/genesis-mainnet-v1.json $DATA_DIR/bor/genesis.json
fi

start() {
  bor server \
    --chain $DATA_DIR/bor/genesis.json \
    --syncmode full \
    --datadir /data \
    --bootnodes enode://0cb82b395094ee4a2915e9714894627de9ed8498fb881cec6db7c65e8b9a5bd7f2f25cc84e71e89d0947e51c76e85d0847de848c7782b13c0255247a6758178c@44.232.55.71:30303,enode://88116f4295f5a31538ae409e4d44ad40d22e44ee9342869e7d68bdec55b0f83c1530355ce8b41fbec0928a7d75a5745d528450d30aec92066ab6ba1ee351d710@159.203.9.164:30303 \
    --http \
    --http.addr 0.0.0.0 \
    --http.api eth,net,web3,debug,txpool,bor \
    --http.vhosts '*' \
    --http.corsdomain '*' \
    --ws \
    --ws.addr 0.0.0.0 \
    --ws.api eth,net,web3,debug,txpool,bor \
    --ws.origins '*' \
    --txlookuplimit 0 \
    --cache 4096 \
    --ipcdisable \
    --nat none &
  PID="$!"
}

stop() {
  echo "Catching signal and sending to PID: $PID" && kill $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
