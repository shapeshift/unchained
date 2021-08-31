# Bootstrap Node from Snapshot

```sh
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: data-daemon-ethereum-indexer-sts-<pod number>-pv
  labels:
    failure-domain.beta.kubernetes.io/region: <region> # i.e. us-east-1
    failure-domain.beta.kubernetes.io/zone: <zone>     # i.e. us-east-1b
spec:
  storageClassName: gp2
  capacity:
    storage: 1500Gi
  accessModes:
    - ReadWriteOnce
  awsElasticBlockStore:
    volumeID: <vol-XXXXXXXXXXXXXXXX>
    fsType: ext4
  persistentVolumeReclaimPolicy: Retain
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-daemon-ethereum-indexer-sts-<pod number>
  namespace: unchained
  labels:
    app: unchained
    asset: ethereum
    tier: daemon
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1500Gi
  storageClassName: gp2
  name: data-daemon-ethereum-indexer-sts-<pod number>-pv
EOF
```
