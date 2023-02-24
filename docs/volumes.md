# Bootstrap Node from Snapshot

1. Manually set statefulset replicas for the target coinstack to 0.
2. Delete PVCs and PVs related to the coinstack.
 
```sh
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: data-daemon-ethereum-sts-0-pv
  labels:
    failure-domain.beta.kubernetes.io/region: us-east-2
    failure-domain.beta.kubernetes.io/zone: us-east-2b
spec:
  storageClassName: ebs-csi-gp2
  capacity:
    storage: 2500Gi
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
  name: data-daemon-ethereum-sts-0
  namespace: unchained
  labels:
    app: unchained
    asset: ethereum
    tier: statefulservice
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 2500Gi
  storageClassName: ebs-csi-gp2
  volumeName: data-daemon-ethereum-sts-0-pv
EOF
```
