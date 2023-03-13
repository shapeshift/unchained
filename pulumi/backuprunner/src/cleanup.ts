import k8s from '@kubernetes/client-node'

export const cleanup = async (k8sApi: k8s.KubernetesObjectApi, pvcList: string, backupCount: number, namespace: string, sts: string) => {
  var pvcCount = pvcList.split(',').length;
  var pvcsToKeep = pvcCount*backupCount;
  console.log(`Backup count to keep - ${backupCount}. System consists of ${pvcCount} PVC's replicas, so will keep ${pvcsToKeep} latest snapshots`)

  const snapshots = await k8sApi.list("snapshot.storage.k8s.io/v1", "VolumeSnapshot", namespace, undefined, undefined, undefined, `statefulset=${sts}`);
  const items = snapshots.body.items
  console.log(`Found ${items.length} snapshots for ${namespace}.${sts}`)


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
