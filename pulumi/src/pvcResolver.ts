import * as k8s from '@pulumi/kubernetes'
import { VolumeSnapshot } from './volumeSnapshotClient';

export const getVolumeClaimTemplates = (
  serviceName: string,
  storageSize: string,
  snapshots: VolumeSnapshot[]
): Array<k8s.types.input.core.v1.PersistentVolumeClaim> => {
  const snapshot = snapshots.filter(snapshot => snapshot.metadata.name.includes(serviceName) && snapshot.status.readyToUse)[0]
  const pvc: k8s.types.input.core.v1.PersistentVolumeClaim = {
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
      },
      ...(snapshot && {
        dataSource: {
          name: snapshot.metadata.name,
          kind: snapshot.kind,
          apiGroup: snapshot.apiVersion.split('/')[0],
        },
      }),
    },
  }

  return [pvc]
}