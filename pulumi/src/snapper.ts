import * as k8sClient from '@kubernetes/client-node'

export interface VolumeSnapshot extends Required<k8sClient.KubernetesObject> {
  metadata: {
    name: string
    creationTimestamp: Date
    namespace: string
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
  status?: {
    readyToUse: boolean
  }
}

export interface SnapperArgs {
  assetName: string
  kubeconfig?: string
  namespace: string
}

export class Snapper {
  readonly assetName: string
  readonly stsName: string
  readonly namespace: string

  protected readonly kubeConfig: k8sClient.KubeConfig
  protected readonly k8sObjectApi: k8sClient.KubernetesObjectApi

  constructor(args: SnapperArgs) {
    this.assetName = args.assetName
    this.stsName = `${args.assetName}-sts`
    this.namespace = args.namespace

    this.kubeConfig = new k8sClient.KubeConfig()

    if (args.kubeconfig) {
      this.kubeConfig.loadFromString(args.kubeconfig)
    } else {
      this.kubeConfig.loadFromDefault()
    }

    this.k8sObjectApi = this.kubeConfig.makeApiClient(k8sClient.KubernetesObjectApi)
  }

  async getSnapshots(): Promise<VolumeSnapshot[]> {
    const { body } = await this.k8sObjectApi.list<VolumeSnapshot>(
      'snapshot.storage.k8s.io/v1',
      'VolumeSnapshot',
      this.namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `statefulset=${this.stsName}`
    )

    const items = body.items.map((item) => {
      const deserializedItem = Object.assign({}, item)
      deserializedItem.metadata.creationTimestamp = new Date(item.metadata.creationTimestamp)
      return deserializedItem
    })

    // sorted newest -> oldest
    return items.sort((a, b) => b.metadata.creationTimestamp.getTime() - a.metadata.creationTimestamp.getTime())
  }

  protected async takeSnapshots(pvcList: Array<string>): Promise<void> {
    try {
      return await this.takeSnapshotInternal(pvcList)
    } catch (err) {
      console.error(`Could not create VolumeSnaphot:`, err)
      return Promise.resolve()
    }
  }

  private async takeSnapshotInternal(pvcList: Array<string>): Promise<void> {
    const timestamp = new Date()
    await Promise.all(
      pvcList.map(async (pvc) => {
        const snapshotName = `${pvc}-backup-${timestamp.getTime()}`
        console.log(`Taking snapshot of pvc ${pvc} - ${snapshotName}`)

        const snapshotYaml: VolumeSnapshot = {
          apiVersion: 'snapshot.storage.k8s.io/v1',
          kind: 'VolumeSnapshot',
          metadata: {
            name: snapshotName,
            namespace: this.namespace,
            labels: {
              statefulset: this.stsName,
            },
            creationTimestamp: timestamp, // will be overwritten by k8s
          },
          spec: {
            volumeSnapshotClassName: 'csi-aws-vsc',
            source: {
              persistentVolumeClaimName: pvc,
            },
          },
        }

        await this.k8sObjectApi.create(snapshotYaml)
        console.log(`Snapshot ${snapshotName} finished`)
      })
    )
  }

  protected async removeSnapshots(retainCount: number): Promise<void> {
    const snapshots = await this.getSnapshots()

    if (snapshots.length < retainCount) {
      console.log('No snapshots to clean up')
      return
    }

    const [toKeep, toRemove] = [snapshots.slice(0, retainCount), snapshots.slice(retainCount)]

    console.log(`Volume snapshots to keep: ${toKeep.length}`)
    toKeep.forEach((x) => console.log(x.metadata.name))

    console.log(`Volume snapshots to remove: ${toRemove.length}`)
    toRemove.forEach((x) => console.log(x.metadata.name))

    // remove oldest -> newest
    await Promise.all(
      toRemove.reverse().map(async (snapshot) => {
        await this.k8sObjectApi.delete(snapshot)
        console.log(`Snapshot ${snapshot.metadata.name} removed`)
      })
    )

    console.log('Snapshot removal finished')
  }
}
