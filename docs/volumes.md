## Bootstrap Node from Snapshot

Via AWS console, provision a volume from aws snapshot to allow fast sync for a new node:

- use staging | production account
- ec2 > snapshots
- find most recent successful snapshot for coin i.e. data-ethereum-2513
- resture new volume from snapshot
- note volumeID and update in below snippet
- update other relevant info i.e. coin name, version, namespace etc

Update the below snippet and apply:

```
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: data-ethereum-daemon-sts-<pod_number>-pv
  labels:
    failure-domain.beta.kubernetes.io/region: <region> # i.e. eu-west-1
    failure-domain.beta.kubernetes.io/zone: <zone>     # i.e. eu-west-1b
spec:
  storageClassName: gp2
  capacity:
    storage: 1000Gi
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
  name: data-ethereum-daemon-sts-<pod_number>
  namespace: ethereum
  labels:
    app: unchained
    asset: ethereum
    tier: daemon
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1000Gi
  storageClassName: gp2
  volumeName: data-ethereum-daemon-sts-<pod_number>-pv
EOF
```
