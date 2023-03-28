import * as k8s from '@kubernetes/client-node'
import assert from 'assert'

const delay = (time: number) => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

interface StatefulSet extends k8s.V1StatefulSet {
  spec: k8s.V1StatefulSetSpec
}

interface VolumeSnapshot extends Required<k8s.KubernetesObject> {
  metadata: {
    name: string
    // the actual type is string but the parent object has this messed up
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

export interface VolumeReaperArgs {
  asset: string
  backupCount: number
  namespace: string
  services: string
}

export class VolumeReaper {
  readonly asset: string
  readonly backupCount: number
  readonly name: string
  readonly namespace: string
  readonly services: string

  private readonly k8sAppsApi: k8s.AppsV1Api
  private readonly k8sObjectApi: k8s.KubernetesObjectApi

  constructor(args: VolumeReaperArgs) {
    this.asset = args.asset
    this.backupCount = args.backupCount
    this.namespace = args.namespace
    this.name = `${args.asset}-sts`
    this.services = args.services

    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()

    this.k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api)
    this.k8sObjectApi = k8s.KubernetesObjectApi.makeApiClient(kc)
  }

  async run(): Promise<void> {
    try {
      const sts = await this.getStatefulSet()
      const replicas = sts.spec?.replicas ?? 0

      assert(replicas >= 1, 'Replicas needs to be larger than 0 to run backup')

      const pvcList = this.services.split(',').map((svc) => `data-${svc}-${this.asset}-sts-${replicas - 1}`)
      const retainCount = pvcList.length * this.backupCount

      await this.scaleStatefulSet(replicas - 1, false)
      await this.takeSnapshots(pvcList)
      await this.scaleStatefulSet(replicas, true)
      await this.removeSnapshots(retainCount)
    } catch (err) {
      if (err instanceof k8s.HttpError) {
        console.error('K8s operation failed:', err.body)
      } else {
        console.error(err)
      }
    }
  }

  private async getStatefulSet(): Promise<StatefulSet> {
    const { body } = await this.k8sAppsApi.readNamespacedStatefulSetStatus(this.name, this.namespace)

    if (!body.spec) throw new Error(`No spec found for StatefulSet: ${this.namespace}.${this.name}`)

    const sts: StatefulSet = {
      ...body,
      spec: body.spec,
    }

    return sts
  }

  private async scaleStatefulSet(count: number, skipAwait: boolean): Promise<void> {
    console.log(`Scaling StatefulSet ${this.namespace}.${this.name} to ${count} replicas`)

    const sts = await this.getStatefulSet()
    sts.spec.replicas = count

    await this.k8sAppsApi.replaceNamespacedStatefulSet(this.name, this.namespace, sts)

    if (skipAwait) return

    for (let i = 0; i < 100; i++) {
      // termination grace period is 120s so need to account for that
      console.log(`Waiting for ${this.name} to scale down...`)

      await delay(3000)
      const status = await this.k8sAppsApi.readNamespacedStatefulSetStatus(this.name, this.namespace)

      if (status.body.status?.availableReplicas === count) {
        console.log(`Scaling finished - ${this.namespace}.${this.name} availableReplicas is now ${count}`)
        return
      }
    }
  }

  private async getSnapshots(): Promise<VolumeSnapshot[]> {
    const snapshots = await this.k8sObjectApi.list<VolumeSnapshot>(
      'snapshot.storage.k8s.io/v1',
      'VolumeSnapshot',
      this.namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `statefulset=${this.name}`
    )

    const items = snapshots.body.items
    console.log(`Found ${items.length} snapshots for ${this.namespace}.${this.name}`)

    // sorted newest -> oldest
    return items.sort((a, b) => new Date(b.metadata.creationTimestamp).getTime() - new Date(a.metadata.creationTimestamp).getTime())
  }

  private async takeSnapshots(pvcList: Array<string>): Promise<void> {
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
            labels: {
              statefulset: this.name,
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

  private async removeSnapshots(retainCount: number): Promise<void> {
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
