import k8s, { KubernetesObject } from '@kubernetes/client-node'

export const cleanup = async (
  k8sApi: k8s.KubernetesObjectApi,
  sts: string,
  namespace: string,
  pvcList: string,
  backupCount: number
) => {
  var pvcCount = pvcList.split(',').length
  var pvcsToKeepCount = pvcCount * backupCount

  const snapshots = await getExistingVolumeSnapshots(k8sApi, sts, namespace)
  console.log(
    `Backup count to keep - ${backupCount}. ${sts} consists of ${pvcCount} PVC's, so will keep ${pvcsToKeepCount} latest snapshots`
  )

  if (snapshots.length > pvcsToKeepCount) {
    await removeOldSnapshots(k8sApi, snapshots, pvcsToKeepCount)
  }

  console.log('Snapshot cleanup completed')
}

const getExistingVolumeSnapshots = async (
  k8sApi: k8s.KubernetesObjectApi,
  sts: string,
  namespace: string
): Promise<KubernetesObject[]> => {
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

const sortByCreationTimestampDesc = (a: KubernetesObject, b: KubernetesObject) =>
  new Date(b.metadata?.creationTimestamp!!).getTime() - new Date(a.metadata?.creationTimestamp!!).getTime()

const removeOldSnapshots = async (
  k8sApi: k8s.KubernetesObjectApi,
  snapshots: KubernetesObject[],
  snapshotsToKeepCount: number
) => {
  await Promise.all(
    getSnapshotsToRemove(snapshots, snapshotsToKeepCount).map(async (vc) => await deleteSnapshot(k8sApi, vc))
  )
}

const deleteSnapshot = async (k8sApi: k8s.KubernetesObjectApi, snapshot: KubernetesObject) => {
  await k8sApi.delete({
    apiVersion: snapshot.apiVersion,
    kind: snapshot.kind,
    metadata: {
      name: snapshot.metadata?.name,
      labels: snapshot.metadata?.labels,
    },
  })
  console.log(`Deleted ${snapshot.metadata?.name}`)
}

const getSnapshotsToRemove = (snapshots: KubernetesObject[], pvcsToKeepCount: number) => {
  const [toKeep, toRemove] = [snapshots.slice(0, pvcsToKeepCount), snapshots.slice(pvcsToKeepCount)]

  console.log(`Volume snapshots to keep: ${toKeep.length}`)
  toKeep.forEach((x) => console.log(x.metadata?.name))

  console.log(`Volume snapshots to remove: ${toRemove.length}`)
  toRemove.forEach((x) => console.log(x.metadata?.name))

  // Start removal from the oldest VC's
  return toRemove.reverse()
}
