import k8s, { KubernetesObject } from '@kubernetes/client-node'

export const cleanup = async (k8sApi: k8s.KubernetesObjectApi, sts: string, namespace: string, pvcList: string, backupCount: number) => {
  var pvcCount = pvcList.split(',').length;
  var pvcsToKeepCount = pvcCount*backupCount;

  const snapshots = await getExistingVolumeSnapshots(k8sApi, sts, namespace);
  console.log(`Backup count to keep - ${backupCount}. ${sts} consists of ${pvcCount} PVC's, so will keep ${pvcsToKeepCount} latest snapshots`)

  if(snapshots.length <= pvcsToKeepCount){
    console.log(`Not archiving old snapshots, too few results`)
  }else {
    await removeOldSnapshots(k8sApi, snapshots, pvcsToKeepCount)
  }

  console.log("Snapshot cleanup completed");
}

const getExistingVolumeSnapshots = async (k8sApi: k8s.KubernetesObjectApi, sts: string, namespace: string): Promise<KubernetesObject[]> => {
  const snapshots = await k8sApi.list("snapshot.storage.k8s.io/v1", "VolumeSnapshot", namespace, undefined, undefined, undefined, undefined, `statefulset=${sts}`);
  const items = snapshots.body.items
  console.log(`Found ${items.length} snapshots for ${namespace}.${sts}`)
  return items.sort(sortByCreationTimestampDesc)
}

const sortByCreationTimestampDesc = ((a: KubernetesObject, b: KubernetesObject) => (new Date(b.metadata!!.creationTimestamp!!).getTime()  - new Date(a.metadata!!.creationTimestamp!!).getTime()));

const removeOldSnapshots = async (k8sApi: k8s.KubernetesObjectApi, snapshots: KubernetesObject[], pvcsToKeepCount: number) => {
  Promise.all(getSnapshotsToRemove(snapshots, pvcsToKeepCount).map(async vc => await deleteSnapshot(k8sApi, vc)))
}

const deleteSnapshot = async (k8sApi: k8s.KubernetesObjectApi, vc: KubernetesObject) => {
    await k8sApi.delete({
      apiVersion: vc.apiVersion,
      kind: vc.kind,
      metadata: {
        name: vc.metadata?.name,
        labels: vc.metadata?.labels
      }
    })
    console.log(`Deleted ${vc.metadata?.name}`)
}

const getSnapshotsToRemove = (snapshots: KubernetesObject[], pvcsToKeepCount: number) => {

  var [toKeep, toRemove] = [snapshots.slice(0, pvcsToKeepCount), snapshots.slice(pvcsToKeepCount)]

  console.log(`Volume snapshots to keep: ${toKeep.length}`)
  toKeep.forEach(x => console.log(x.metadata?.name))

  console.log(`Volume snapshots to remove: ${toRemove.length}`)
  toRemove.forEach(x => console.log(x.metadata?.name))

  // Start removal from the oldest VC's
  return toRemove.reverse()
}