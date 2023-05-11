# Bootstrap Node from Snapshot

1. Manually set statefulset replicas for the target coinstack to 0.
2. Delete PVCs and PVs related to the coinstack.
 
```sh
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  finalizers:
  - kubernetes.io/pv-protection
  - external-attacher/ebs-csi-aws-com
  name: data-indexer-ethereum-sts-0-pv
spec:
  accessModes:
    - ReadWriteOnce
  capacity:
    storage: 500Gi
  csi:
    driver: ebs.csi.aws.com
    fsType: ext4
    volumeHandle: vol-xxxxxxxxxxxxxxxxx
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - key: topology.ebs.csi.aws.com/zone
          operator: In
          values:
          - us-east-2a
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ebs-csi-gp2
  volumeMode: Filesystem
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-indexer-ethereum-sts-0
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
      storage: 500Gi
  storageClassName: ebs-csi-gp2
  volumeName: data-indexer-ethereum-sts-0-pv
EOF
```
