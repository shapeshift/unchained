import k8s, { KubernetesObject } from '@kubernetes/client-node'
import { VolumeSnapshot } from './snapshot'

export const cleanup = async (
  k8sApi: k8s.KubernetesObjectApi,
  sts: string,
  namespace: string,
  pvcsToKeepCount: number
) => {
  const snapshots = await getExistingVolumeSnapshots(k8sApi, sts, namespace)
  if (snapshots.length > pvcsToKeepCount) {
    await removeOldSnapshots(k8sApi, snapshots, pvcsToKeepCount)
  }

  console.log('Snapshot cleanup completed')
}

const getExistingVolumeSnapshots = async (
  k8sApi: k8s.KubernetesObjectApi,
  sts: string,
  namespace: string
): Promise<VolumeSnapshot[]> => {
  const snapshots = await k8sApi.list<VolumeSnapshot>(
    'snapshot.storage.k8s.io/v1',
    'VolumeSnapshot',
    namespace,
    undefined,
    undefined,
    undefined,
    undefined,
    `statefulset=${sts}`
  )
  const items = snapshots.body.items
  console.log(`Found ${items.length} snapshots for ${namespace}.${sts}`)
  return items.sort(sortByCreationTimestampDesc)
}

const sortByCreationTimestampDesc = (a: VolumeSnapshot, b: VolumeSnapshot) =>
  new Date(b.metadata.creationTimestamp).getTime() - new Date(a.metadata.creationTimestamp).getTime()

const removeOldSnapshots = async (
  k8sApi: k8s.KubernetesObjectApi,
  snapshots: VolumeSnapshot[],
  snapshotsToKeepCount: number
) => {
  await Promise.all(
    getSnapshotsToRemove(snapshots, snapshotsToKeepCount).map(async (snapshot) => await deleteSnapshot(k8sApi, snapshot))
  )
}

const deleteSnapshot = async (k8sApi: k8s.KubernetesObjectApi, snapshot: VolumeSnapshot) => {
  await k8sApi.delete({
    apiVersion: snapshot.apiVersion,
    kind: snapshot.kind,
    metadata: {
      name: snapshot.metadata.name,
      labels: snapshot.metadata.labels,
    },
  })
  console.log(`Deleted ${snapshot.metadata.name}`)
}

const getSnapshotsToRemove = (snapshots: VolumeSnapshot[], pvcsToKeepCount: number) => {
  const [toKeep, toRemove] = [snapshots.slice(0, pvcsToKeepCount), snapshots.slice(pvcsToKeepCount)]

  console.log(`Volume snapshots to keep: ${toKeep.length}`)
  toKeep.forEach((x) => console.log(x.metadata.name))

  console.log(`Volume snapshots to remove: ${toRemove.length}`)
  toRemove.forEach((x) => console.log(x.metadata.name))

  // Start removal from the oldest snapshot first
  return toRemove.reverse()
}
