# Blockbook

## Prerequisites

You need to build the blockbook image first before running locally or adding a new coin

```text
(cd "$(git rev-parse --show-toplevel)/packages/blockbook" && make build)
```

## Running

_**All make commands should be run in `coinstacks/{coin}/indexer`**_

1. Generate coin config

```text
make gen-config
```

1. Update the coin config `rpc_url`, `rpc_user` and `rpc_password` to point to the appropriate backend daemon. If there is a dedicated daemon deployed for the coinstack, the internal kubernetes "url" can be used to avoid needing to go through dns \(Ex: \`[http://{podName}.default.svc.cluster.local:{port}](http://{podName}.default.svc.cluster.local:{port})\)
2. Run blockbook

```text
make run
```

This will start blockbook in sync mode and begin indexing the blockchain. All of the data will be saved to `./db` and logfiles will be stored at `./logs`

