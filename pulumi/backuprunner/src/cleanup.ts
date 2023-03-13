import k8s, { KubernetesObject } from '@kubernetes/client-node'

// const sortByCreationTimestamp = 

export const cleanup = async (k8sApi: k8s.KubernetesObjectApi, sts: string, namespace: string, pvcList: string, backupCount: number) => {
  var pvcCount = pvcList.split(',').length;
  var pvcsToKeepCount = pvcCount*backupCount;
  console.log(`Backup count to keep - ${backupCount}. ${sts} consists of ${pvcCount} PVC's, so will keep ${pvcsToKeepCount} latest snapshots`)

  const snapshots = await k8sApi.list("snapshot.storage.k8s.io/v1", "VolumeSnapshot", namespace, undefined, undefined, undefined, undefined, `statefulset=${sts}`);
  const items = snapshots.body.items
  console.log(`Found ${items.length} snapshots for ${namespace}.${sts}`)

  console.log(items[0].metadata)
  console.log(typeof(items[0].metadata))
  console.log(items[0].metadata!!.creationTimestamp!!)
  console.log(new Date(items[0].metadata!!.creationTimestamp!!).getTime())
  console.log(items[0].metadata?.creationTimestamp)

  var sorted = items.sort((a, b) => (new Date(a.metadata!!.creationTimestamp!!).getTime()  - new Date(b.metadata!!.creationTimestamp!!).getTime()));

  sorted.forEach(x => console.log(x))

  if(sorted.length <= pvcsToKeepCount){
    console.log(`Not archiving old snapshots, too few results`)
    return;
  }

  var [toKeep, toRemove] = [sorted.slice(0, pvcsToKeepCount), sorted.slice(pvcsToKeepCount)]

  console.log("Volume snapshots to keep: ", toKeep.length)
  toKeep.forEach(x => console.log(x.metadata?.name, x.metadata?.creationTimestamp))

  console.log("Volume snapshots to remove: ", toRemove.length)
  toRemove.forEach(x => console.log(x.metadata?.name, x.metadata?.creationTimestamp))



  // const timestamp = new Date().getTime();
  // pvcList
  // .split(',')
  // .forEach(async pvc => await takeSnapshot(k8sApi, pvc, timestamp))
}

// const takeSnapshot = async (k8sApi: k8s.KubernetesObjectApi, pvcName: string, timestamp: number) => {  
//   var snapshotName = `${pvcName}-backup-${timestamp}`
//   console.log(`Taking snapshot of pvc ${pvcName} - ${snapshotName}`);
//   const snapshotYaml: VolumeSnapshot = {
//     apiVersion: "snapshot.storage.k8s.io/v1",
//     kind: "VolumeSnapshot",
//     metadata: {
//       name: snapshotName,
//     },
//     spec: {
//       volumeSnapshotClassName: "csi-aws-vsc",
//       source: {
//         persistentVolumeClaimName: pvcName,
//       },
//     },

//   };
//   await k8sApi.create(snapshotYaml)
// };
