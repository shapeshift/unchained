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

export class PvcResolver {

  private readonly k8sObjectApi: k8sClient.KubernetesObjectApi
  private readonly namespace: string

  constructor(kubeconfig: string, namespace: string){
    const kc = new k8sClient.KubeConfig()
    kc.loadFromString(kubeconfig)
    this.k8sObjectApi = kc.makeApiClient(k8sClient.KubernetesObjectApi)
    this.namespace = namespace;
  }

  private getLatestSnapshot = async (assetName: string): Promise<VolumeSnapshot | undefined> => {
    const response = await this.k8sObjectApi.list<VolumeSnapshot>(
      'snapshot.storage.k8s.io/v1',
      'VolumeSnapshot',
      this.namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `statefulset=${assetName}-sts`
    )

    console.log('Snapshots found: ', response.body.items.length)

    const latestSnapshots = response.body.items.sort(
      (a, b) => b.metadata.creationTimestamp.getTime() - a.metadata.creationTimestamp.getTime()
    ).filter(snapshot => snapshot.metadata.labels.statefulset === assetName);

    if(latestSnapshots.length > 0 ){
      return latestSnapshots[0]
    }
    return undefined;
  }

  private getPvcBase = (assetName: string, storageSize: string): k8s.types.input.core.v1.PersistentVolumeClaim => {
    return {
      metadata: {
        name: `data-${assetName}`,
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

  getVolumeClaimTemplates = async (assetName: string, storageSize: string): Promise<Array<k8s.types.input.core.v1.PersistentVolumeClaim>> => {
    const pvcBase = this.getPvcBase(assetName, storageSize);
    const snapshot = await this.getLatestSnapshot(assetName);

    return (snapshot ? [Object.assign(pvcBase, {
          datasource: {
            name: snapshot.metadata.name,
            kind: "VolumeSnapshot",
            apiGroup: "snapshot.storage.k8s.io"
          }
        }) as PVCFromBackup] : [pvcBase])
  }
}
