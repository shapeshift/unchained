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
  },
  status: {
    readyToUse: boolean,
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

  private getLatestSnapshot = async (assetName: string, serviceName: string): Promise<VolumeSnapshot | undefined> => {
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

    const latestSnapshots = 
      response.body.items
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

  private getPvcBase = (serviceName: string, storageSize: string): k8s.types.input.core.v1.PersistentVolumeClaim => {
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

  getVolumeClaimTemplates = async (assetName: string, serviceName: string, storageSize: string): Promise<Array<k8s.types.input.core.v1.PersistentVolumeClaim>> => {
    const pvcBase = this.getPvcBase(serviceName, storageSize);
    const snapshot = await this.getLatestSnapshot(assetName, serviceName);

    const ret = (snapshot ? [Object.assign(pvcBase, {
          datasource: {
            name: snapshot.metadata.name,
            kind: "VolumeSnapshot",
            apiGroup: "snapshot.storage.k8s.io"
          }
        }) as PVCFromBackup] : [pvcBase])

    console.log(`PVC: ${JSON.stringify(ret)}`)
    return ret;
  }
}
