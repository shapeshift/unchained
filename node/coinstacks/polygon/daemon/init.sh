#!/bin/sh

set -e

apk add bash curl jq wget zstd tar

[ "$DEBUG" = "true" ] && set -x

DATA_DIR=/data
CHAINDATA_DIR=$DATA_DIR/bor/chaindata

function extract_files() {
  while read -r line; do
    if echo "$line" | grep -q checksum; then
      continue
    fi

    if echo "$line" | grep -q "bulk"; then
      wget -nc --timeout 0 --retry-connrefused --tries 0 $line -O - | zstd -cd | tar -xvf - --skip-old-files -C $CHAINDATA_DIR
    else
      wget -nc --timeout 0 --retry-connrefused --tries 0 $line -O - | zstd -cd | tar -xvf - --skip-old-files -C $CHAINDATA_DIR --strip-components=3
    fi

    sed -i -e "\|$line|,+1d" $DATA_DIR/$filename
  done < $1
}

# shapshots provided by: https://snapshot.polygon.technology/
if [ -n "$SNAPSHOT" ]; then
  filename=$(echo $SNAPSHOT | awk -F/ '{print $NF}')

  if [ ! -f "$DATA_DIR/$filename" ] && [ ! -d "$CHAINDATA_DIR" ]; then
    rm -rf $DATA_DIR/bor;
    mkdir -p $CHAINDATA_DIR;
    wget $SNAPSHOT -O $DATA_DIR/$filename
  fi

  if [ -f "$DATA_DIR/$filename" ]; then
    extract_files $DATA_DIR/$filename
    rm $DATA_DIR/$filename
  fi
fi

if [ ! -f "$DATA_DIR/bor/genesis.json" ]; then
  # copy genesis file
  cp /var/lib/bor/genesis-mainnet-v1.json $DATA_DIR/bor/genesis.json
fi

start() {
  bor server \
    --chain $DATA_DIR/bor/genesis.json \
    --syncmode full \
    --datadir /data \
    --bootnodes enode://0cb82b395094ee4a2915e9714894627de9ed8498fb881cec6db7c65e8b9a5bd7f2f25cc84e71e89d0947e51c76e85d0847de848c7782b13c0255247a6758178c@44.232.55.71:30303,enode://88116f4295f5a31538ae409e4d44ad40d22e44ee9342869e7d68bdec55b0f83c1530355ce8b41fbec0928a7d75a5745d528450d30aec92066ab6ba1ee351d710@159.203.9.164:30303,enode://3178257cd1e1ab8f95eeb7cc45e28b6047a0432b2f9412cff1db9bb31426eac30edeb81fedc30b7cd3059f0902b5350f75d1b376d2c632e1b375af0553813e6f@35.221.13.28:30303,enode://16d9a28eadbd247a09ff53b7b1f22231f6deaf10b86d4b23924023aea49bfdd51465b36d79d29be46a5497a96151a1a1ea448f8a8666266284e004306b2afb6e@35.199.4.13:30303,enode://3178257cd1e1ab8f95eeb7cc45e28b6047a0432b2f9412cff1db9bb31426eac30edeb81fedc30b7cd3059f0902b5350f75d1b376d2c632e1b375af0553813e6f@35.221.13.28:30303,enode://16d9a28eadbd247a09ff53b7b1f22231f6deaf10b86d4b23924023aea49bfdd51465b36d79d29be46a5497a96151a1a1ea448f8a8666266284e004306b2afb6e@35.199.4.13:30303 \
    --maxpeers 200 \
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
  echo "Catching signal and sending to PID: $PID" && kill -2 $PID
  while $(kill -0 $PID 2>/dev/null); do sleep 1; done
}

trap 'stop' TERM INT
start
wait $PID
