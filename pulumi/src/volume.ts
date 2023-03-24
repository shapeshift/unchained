import * as k8s from '@pulumi/kubernetes'
import { VolumeSnapshot } from './statefulService';

interface PVCFromBackup extends k8s.types.input.core.v1.PersistentVolumeClaim {
  datasource: {
    name: string;
    kind: string;
    apiGroup: string;
  }
}

class PvcResolver{

  readonly name: string;
  readonly storageSize: string;

  constructor(name: string, storageSize: string, kubeconfig: string){
    this.name = name
    this.storageSize = storageSize;
  }

  private getPvcBase = (): k8s.types.input.core.v1.PersistentVolumeClaim => {
    return {
      metadata: {
        name: `data-${this.name}`,
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        storageClassName: 'ebs-csi-gp2',
        resources: {
          requests: {
            storage: this.storageSize,
          },
        }
      },
    }
  }

  getVolumeClaimTemplates = (name: string, storageSize: string, snapshots?: Array<VolumeSnapshot>): Array<k8s.types.input.core.v1.PersistentVolumeClaim> => {
    const pvcBase = this.getPvcBase();
    const matchingSnapshots = snapshots?.filter(snapshot => snapshot.metadata.labels.statefulset === name);
  
    if(matchingSnapshots && matchingSnapshots.length > 0) {
      const matching = matchingSnapshots[0]
        const pvc: PVCFromBackup = Object.assign(pvcBase, {
          datasource: {
            name: matching.metadata.name,
            kind: "VolumeSnapshot",
            apiGroup: "snapshot.storage.k8s.io"
          }
        })
        return [
          pvc
        ]
      }
    return [
      {
        metadata: {
          name: `data-${name}`,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: 'ebs-csi-gp2',
          resources: {
            requests: {
              storage: storageSize,
            },
          },
        },
      },
    ]
  }

}




