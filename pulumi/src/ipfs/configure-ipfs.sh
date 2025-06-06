#!/bin/sh

set -ex

user=ipfs

mkdir -p /data/ipfs

if [ ! -f /data/ipfs/config ]; then
  ipfs init --profile=server
fi

if [ -f /data/ipfs/repo.lock ]; then
  rm /data/ipfs/repo.lock
fi

ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080
ipfs config Swarm.ConnMgr.GracePeriod 20s
ipfs config --json Swarm.ConnMgr.HighWater 10000
ipfs config --json Swarm.ConnMgr.LowWater 2500
ipfs config --json Internal.Bitswap.EngineBlockstoreWorkerCount 2500
ipfs config --json Internal.Bitswap.EngineTaskWorkerCount 500
ipfs config --json Internal.Bitswap.MaxOutstandingBytesPerPeer 1048576
ipfs config --json Internal.Bitswap.TaskWorkerCount 500
ipfs config --json Datastore.BloomFilterSize 1048576
ipfs config --json Peering.Peers '[{ "ID": "Qma8ddFEQWEU8ijWvdxXm3nxU7oHsRtCykAaVz8WUYhiKn", "Addrs": ["/dnsaddr/bitswap.pinata.cloud"] }]'
ipfs config Datastore.StorageMax 100GB

chown -R "$user" /data/ipfs