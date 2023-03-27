import * as k8s from '@pulumi/kubernetes'
import { VolumeSnapshot } from './volumeSnapshotClient';

interface PVCFromBackup extends k8s.types.input.core.v1.PersistentVolumeClaim {
  datasource: {
    name: string;
    kind: string;
    apiGroup: string;
  }
}

export const getVolumeClaimTemplates = (snapshots: VolumeSnapshot[], serviceName: string, storageSize: string): Array<k8s.types.input.core.v1.PersistentVolumeClaim> => {
  const pvcBase = getPvcBase(serviceName, storageSize);
  const snapshot = getLatestSnapshot(snapshots, serviceName);

  const ret = (snapshot ? [Object.assign(pvcBase, {
        datasource: {
          name: snapshot.metadata.name,
          kind: "VolumeSnapshot",
          apiGroup: "snapshot.storage.k8s.io"
        }
      }) as PVCFromBackup] : [pvcBase])
  return ret;
}

const getLatestSnapshot = (snapshots: VolumeSnapshot[], serviceName: string): VolumeSnapshot | undefined => {
  const latestSnapshots = 
  snapshots
    .filter(vs => vs.metadata.name.includes(serviceName))
    .filter(vs => vs.status.readyToUse).sort(
      (a, b) => new Date(b.metadata.creationTimestamp).getTime() - new Date(a.metadata.creationTimestamp).getTime()
    )

  if(latestSnapshots.length > 0 ){
    console.log('Restoring volume from snapshot: ' + latestSnapshots[0].metadata.name)
    return latestSnapshots[0]
  }
  return undefined;
}

const getPvcBase = (serviceName: string, storageSize: string): k8s.types.input.core.v1.PersistentVolumeClaim => {
  return {
    metadata: {
      name: `data-${serviceName}`,
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      storageClassName: 'ebs-csi-gp2',
      resources: {
        requests: {
          storage: storageSize,
        },
      }
    },
  }
}
