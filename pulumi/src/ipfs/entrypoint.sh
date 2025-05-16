#!/bin/sh

set -x

user=ipfs

if [ ! -f /data/ipfs-cluster/service.json ]; then
  ipfs-cluster-service init
fi

PEER_HOSTNAME=`cat /proc/sys/kernel/hostname`

grep -q ".*ipfs-0.*" /proc/sys/kernel/hostname

if [ $? -eq 0 ]; then
  exec ipfs-cluster-service daemon --upgrade
else
  exec ipfs-cluster-service daemon --upgrade --bootstrap /dns4/ipfs-0.${SVC_NAME}/tcp/9096/p2p/${BOOTSTRAP_PEER_ID} --leave
fi