#!/bin/bash

set -e

[ "$DEBUG" == "2" ] && set -x

if [ -n "$CHAIN_JSON" ]; then
  CHAIN_METADATA=$(curl -s $CHAIN_JSON)

  export CHAIN_ID="${CHAIN_ID:-$(echo $CHAIN_METADATA | jq -r .chain_id)}"
  export P2P_SEEDS="${P2P_SEEDS:-$(echo $CHAIN_METADATA | jq -r '.peers.seeds | map(.id+"@"+.address) | join(",")')}"
  export P2P_PERSISTENT_PEERS="${P2P_PERSISTENT_PEERS:-$(echo $CHAIN_METADATA | jq -r '.peers.persistent_peers | map(.id+"@"+.address) | join(",")')}"
  export GENESIS_URL="${GENESIS_URL:-$(echo $CHAIN_METADATA | jq -r '.codebase.genesis.genesis_url? // .genesis.genesis_url? // .genesis?')}"
  export PROJECT_BIN="${PROJECT_BIN:-$(echo $CHAIN_METADATA | jq -r '.codebase.daemon_name? // .daemon_name?')}"
  export PROJECT_DIR="${PROJECT_DIR:-$(echo $CHAIN_METADATA | jq -r '.codebase.node_home? // .node_home?')}"
fi

export PROJECT_BIN="${PROJECT_BIN:-$PROJECT}"
export PROJECT_DIR="${PROJECT_DIR:-.$PROJECT_BIN}"
export PROJECT_ROOT="/root/$PROJECT_DIR"
export CONFIG_PATH="$PROJECT_ROOT/config"
export NAMESPACE="$(echo ${PROJECT_BIN^^})"

[ -z "$CHAIN_ID" ] && echo "CHAIN_ID not found" && exit

# snapshot
if [[ -n $SNAPSHOT_QUICKSYNC && ! -f "$PROJECT_ROOT/data/priv_validator_state.json" ]]; then
  SNAPSHOT_PRUNING="${SNAPSHOT_PRUNING:-default}"
  SNAPSHOT_URL=`curl -s $SNAPSHOT_QUICKSYNC | jq -r --arg FILE "$CHAIN_ID-$SNAPSHOT_PRUNING"  'first(.[] | select(.file==$FILE)) | .url'`

  # SNAPSHOT_FORMAT default value generation via SNAPSHOT_URL
  SNAPSHOT_FORMAT_DEFAULT="tar.gz"
  case "${SNAPSHOT_URL,,}" in
    *.tar.gz)   SNAPSHOT_FORMAT_DEFAULT="tar.gz";;
    *.tar.lz4)  SNAPSHOT_FORMAT_DEFAULT="tar.lz4";;
    *.tar.zst)  SNAPSHOT_FORMAT_DEFAULT="tar.zst";;
    # Catchall
    *)          SNAPSHOT_FORMAT_DEFAULT="tar";;
  esac
  SNAPSHOT_FORMAT="${SNAPSHOT_FORMAT:-$SNAPSHOT_FORMAT_DEFAULT}"

  if [ -n "${SNAPSHOT_URL}" ]; then
    echo "Downloading snapshot from $SNAPSHOT_URL..."
    rm -rf $PROJECT_ROOT/data;
    mkdir -p $PROJECT_ROOT/data;
    cd $PROJECT_ROOT/data

    tar_cmd="tar xf -"
    # case insensitive match
    if [[ "${SNAPSHOT_FORMAT,,}" == "tar.gz" ]]; then tar_cmd="tar xzf -"; fi
    if [[ "${SNAPSHOT_FORMAT,,}" == "tar.lz4" ]]; then tar_cmd="lz4 -d | tar xf -"; fi
    if [[ "${SNAPSHOT_FORMAT,,}" == "tar.zst" ]]; then tar_cmd="zstd -cd | tar xf -"; fi

    # Detect content size via HTTP header `Content-Length`
    # Note that the server can refuse to return `Content-Length`, or the URL can be incorrect
    pv_extra_args=""
    snapshot_size_in_bytes=$(wget $SNAPSHOT_URL --spider --server-response -O - 2>&1 | sed -ne '/Content-Length/{s/.*: //;p}')
    case "$snapshot_size_in_bytes" in
      # Value cannot be started with `0`, and must be integer
      [1-9]*[0-9]) pv_extra_args="-s $snapshot_size_in_bytes";;
    esac
    (wget -nv -O - $SNAPSHOT_URL | pv -petrafb -i 5 $pv_extra_args | eval $tar_cmd) 2>&1 | stdbuf -o0 tr '\r' '\n'

    SNAPSHOT_DATA_PATH="data"
    [ -n "${SNAPSHOT_DATA_PATH}" ] && mv ./${SNAPSHOT_DATA_PATH}/* ./ && rm -rf ./${SNAPSHOT_DATA_PATH}
    if [ -n "${SNAPSHOT_WASM_PATH}" ]; then
      rm -rf ../wasm && mkdir ../wasm
      mv ./${SNAPSHOT_WASM_PATH}/* ../wasm && rm -rf ./${SNAPSHOT_WASM_PATH}
    fi
  else
    echo "Snapshot URL not found"
  fi
fi

# polkachu
if [ -n "$P2P_POLKACHU" ]; then
  [ -z "$POLKACHU_NETWORK" ] && echo "POLKACHU_NETWORK not found" && exit

  POLKACHU_CHAIN=`curl -s https://polkachu.com/api/v2/chains/$POLKACHU_NETWORK | jq -r '.'`

  if [ -z "$POLKACHU_CHAIN" ]; then
    echo "polkachu does not support this chain"
  else
    export POLKACHU_SEED_NODE_ENABLED=$(echo $POLKACHU_CHAIN | jq -r '.polkachu_services.seed.active')

    if [ $POLKACHU_SEED_NODE_ENABLED ]; then
      export POLKACHU_SEED_NODE=$(echo $POLKACHU_CHAIN | jq -r '.polkachu_services.seed.seed')

      if [ -n "$P2P_SEEDS" ]; then
        export P2P_SEEDS="$P2P_SEEDS,$POLKACHU_SEED_NODE"
      else
        export P2P_SEEDS="$POLKACHU_SEED_NODE"
      fi
    else
      echo "polkachu seed node is not active for this chain"
    fi
  fi
fi

[ -n "$MONIKER" ] && export "${NAMESPACE}_MONIKER"="$MONIKER"
[ -n "$P2P_SEEDS" ] && [ "$P2P_SEEDS" != '0' ] && export "${NAMESPACE}_P2P_SEEDS=${P2P_SEEDS}"
[ -n "$P2P_PERSISTENT_PEERS" ] && [ "$P2P_PERSISTENT_PEERS" != '0' ] && export "${NAMESPACE}_P2P_PERSISTENT_PEERS"=${P2P_PERSISTENT_PEERS}

# init chain
if [[ ! -d "$CONFIG_PATH" ]]; then
  $PROJECT_BIN init "$MONIKER" --chain-id ${CHAIN_ID}

  # download genesis
  if [[ -n $GENESIS_URL ]]; then
    GENESIS_FILENAME="${GENESIS_FILENAME:-genesis.json}"

    echo "Downloading genesis $GENESIS_URL"
    curl -sfL $GENESIS_URL > genesis.json
    file genesis.json | grep -q 'gzip compressed data' && mv genesis.json genesis.json.gz && gzip -d genesis.json.gz
    file genesis.json | grep -q 'tar archive' && mv genesis.json genesis.json.tar && tar -xf genesis.json.tar && rm genesis.json.tar
    file genesis.json | grep -q 'Zip archive data' && mv genesis.json genesis.json.zip && unzip -o genesis.json.zip

    mkdir -p $CONFIG_PATH
    mv $GENESIS_FILENAME $CONFIG_PATH/genesis.json
  fi
fi

[ -n "$MAX_NUM_OUTBOUND_PEERS" ] && sed -i "s/^max_num_outbound_peers =.*/max_num_outbound_peers = $MAX_NUM_OUTBOUND_PEERS/" $CONFIG_PATH/config.toml

# Overwrite seeds in config.toml for chains that are not using the env variable correctly
if [ "$OVERWRITE_SEEDS" == "1" ]; then
  [ -n "$P2P_SEEDS" ] && [ "$P2P_SEEDS" != '0' ] && sed -i "s/seeds =.*/seeds = \"$P2P_SEEDS\"/" $CONFIG_PATH/config.toml
  [ -n "$P2P_PERSISTENT_PEERS" ] && [ "$P2P_PERSISTENT_PEERS" != '0' ] && sed -i "s/persistent_peers =.*/persistent_peers = \"$P2P_PERSISTENT_PEERS\"/" $CONFIG_PATH/config.toml
fi

# preseed priv_validator_state.json if missing
# ref. https://github.com/tendermint/tendermint/issues/8389
if [[ ! -f "$PROJECT_ROOT/data/priv_validator_state.json" ]]; then
  mkdir -p "$PROJECT_ROOT/data" 2>/dev/null || :
  echo '{"height":"0","round":0,"step":0}' > "$PROJECT_ROOT/data/priv_validator_state.json"
fi

[ "$DEBUG" == "1" ] && printenv

exec "$@"
