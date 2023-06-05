#!/bin/sh

user=ipfs

# This is a custom entrypoint for k8s designed to connect to the bootstrap
# node running in the cluster. It has been set up using a configmap to
# allow changes on the fly.

if [ ! -f /data/ipfs-cluster/service.json ]; then
  ipfs-cluster-service init
fi

PEER_HOSTNAME=`cat /proc/sys/kernel/hostname`

grep -q ".*ipfs-cluster-0.*" /proc/sys/kernel/hostname

if [ $? -eq 0 ]; then
  exec ipfs-cluster-service daemon --upgrade
else
  BOOTSTRAP_ADDR=/dns4/${SVC_NAME}-0/tcp/9096/ipfs/${CLUSTER_ID}

  if [ -z $BOOTSTRAP_ADDR ]; then
    exit 1
  fi

  # Only ipfs user can get here
  exec ipfs-cluster-service daemon --upgrade --bootstrap $BOOTSTRAP_ADDR --leave
fi