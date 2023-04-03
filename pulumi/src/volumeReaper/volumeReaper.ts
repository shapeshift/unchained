import * as k8s from '@kubernetes/client-node'
import assert from 'assert'
import { VolumeSnapshotClient, VolumeSnapshotClientArgs } from '../volumeSnapshotClient'

const delay = (time: number) => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

interface StatefulSet extends k8s.V1StatefulSet {
  spec: k8s.V1StatefulSetSpec
}

export interface VolumeReaperArgs extends VolumeSnapshotClientArgs {
  backupCount: number
  services: string
}

export class VolumeReaper extends VolumeSnapshotClient {
  readonly backupCount: number
  readonly services: string

  private readonly k8sAppsApi: k8s.AppsV1Api

  constructor(args: VolumeReaperArgs) {
    super({ ...args })

    this.backupCount = args.backupCount
    this.services = args.services
    this.k8sAppsApi = this.kubeConfig.makeApiClient(k8s.AppsV1Api)
  }

  async run(): Promise<void> {
    try {
      const sts = await this.getStatefulSet()
      const replicas = sts.spec?.replicas ?? 0

      assert(replicas >= 1, 'Replicas needs to be larger than 0 to run backup')

      const pvcList = this.services.split(',').map((svc) => `data-${svc}-${this.assetName}-sts-${replicas - 1}`)
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
    const { body } = await this.k8sAppsApi.readNamespacedStatefulSetStatus(this.stsName, this.namespace)

    if (!body.spec) throw new Error(`No spec found for StatefulSet: ${this.namespace}.${this.stsName}`)

    const sts: StatefulSet = {
      ...body,
      spec: body.spec,
    }

    return sts
  }

  private async scaleStatefulSet(count: number, skipAwait: boolean): Promise<void> {
    console.log(`Scaling StatefulSet ${this.namespace}.${this.stsName} to ${count} replicas`)

    const sts = await this.getStatefulSet()
    sts.spec.replicas = count

    await this.k8sAppsApi.replaceNamespacedStatefulSet(this.stsName, this.namespace, sts)

    if (skipAwait) return

    for (let i = 0; i < 100; i++) {
      // termination grace period is 120s so need to account for that
      console.log(`Waiting for ${this.stsName} to scale down...`)

      await delay(3000)
      const status = await this.k8sAppsApi.readNamespacedStatefulSetStatus(this.stsName, this.namespace)

      if (status.body.status?.availableReplicas === count) {
        console.log(`Scaling finished - ${this.namespace}.${this.stsName} availableReplicas is now ${count}`)
        return
      }
    }
  }
}
