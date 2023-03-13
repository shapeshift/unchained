import k8s, { KubernetesObject } from '@kubernetes/client-node'

const sortByCreationTimestamp = (a: KubernetesObject, b: KubernetesObject) => (a.metadata?.creationTimestamp?.getDate()!! - b.metadata?.creationTimestamp?.getDate()!!)

export const cleanup = async (k8sApi: k8s.KubernetesObjectApi, sts: string, namespace: string, pvcList: string, backupCount: number) => {
  var pvcCount = pvcList.split(',').length;
  var pvcsToKeep = pvcCount*backupCount;
  console.log(`Backup count to keep - ${backupCount}. System consists of ${pvcCount} PVC's replicas, so will keep ${pvcsToKeep} latest snapshots`)

  const snapshots = await k8sApi.list("snapshot.storage.k8s.io/v1", "VolumeSnapshot", namespace, undefined, undefined, undefined, undefined, `statefulset=${sts}`);
  const items = snapshots.body.items
  console.log(`Found ${items.length} snapshots for ${namespace}.${sts}`)

  var sorted = items.sort(sortByCreationTimestamp);

  sorted.forEach(x => console.log(x))

  if(sorted.length <= pvcsToKeep){
    console.log(`Not archiving old snapshots, too few results`)
    return;
  }

  var [toKeep, toRemove] = [sorted.slice(0, pvcsToKeep), sorted.slice(pvcsToKeep)]

  console.log("Volume snapshots to keep: ")
  toKeep.forEach(x => console.log(x))

  console.log("Volume snapshots to remove: ")
  toRemove.forEach(x => console.log(x))



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
