import * as k8s from '@pulumi/kubernetes'
import * as k8sClient from '@kubernetes/client-node'

interface VolumeSnapshot extends Required<k8sClient.KubernetesObject> {
  metadata: {
    name: string
    creationTimestamp: Date
    labels: {
      statefulset: string
    }
  }
  spec: {
    volumeSnapshotClassName: string
    source: {
      persistentVolumeClaimName: string
    }
  }
}

interface PVCFromBackup extends k8s.types.input.core.v1.PersistentVolumeClaim {
  datasource: {
    name: string;
    kind: string;
    apiGroup: string;
  }
}

class PvcResolver {

  readonly name: string;
  readonly storageSize: string;
  readonly k8sObjectApi: k8sClient.KubernetesObjectApi
  namespace: string

  constructor(name: string, storageSize: string, kubeconfig: string, namespace: string){
    this.name = name
    this.storageSize = storageSize;
    this.namespace = namespace;
    const kc = new k8sClient.KubeConfig()
    kc.loadFromString(kubeconfig)
    this.k8sObjectApi = kc.makeApiClient(k8sClient.KubernetesObjectApi)
  }

  private getSnapshots = async () => {
    const response = await this.k8sObjectApi.list<VolumeSnapshot>(
      'snapshot.storage.k8s.io/v1',
      'VolumeSnapshot',
      this.namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `statefulset=${this.name}-sts`
    )

    console.log('Snapshots found: ', response.body.items.length)

    const snapshots = response.body.items.sort(
      (a, b) => b.metadata.creationTimestamp.getTime() - a.metadata.creationTimestamp.getTime()
    )

    return snapshots;
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

  getVolumeClaimTemplates = async (name: string, storageSize: string): Promise<Array<k8s.types.input.core.v1.PersistentVolumeClaim>> => {
    const pvcBase = this.getPvcBase();
    const snapshots = await this.getSnapshots();
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




