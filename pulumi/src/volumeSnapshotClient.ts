import * as k8sClient from '@kubernetes/client-node'

export interface VolumeSnapshot extends Required<k8sClient.KubernetesObject> {
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

export class VolumeSnapshotClient {

  private readonly k8sObjectApi: k8sClient.KubernetesObjectApi
  private readonly namespace: string

  constructor(kubeconfig: string, namespace: string){
    const kc = new k8sClient.KubeConfig()
    kc.loadFromString(kubeconfig)
    this.k8sObjectApi = kc.makeApiClient(k8sClient.KubernetesObjectApi)
    this.namespace = namespace;
  }

  getVolumeSnapshots = async (assetName: string): Promise<VolumeSnapshot[]> => {
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

    return response.body.items;
  }
}
