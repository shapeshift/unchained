import k8s, { KubernetesObject } from "@kubernetes/client-node";

interface VolumeSnapshot extends KubernetesObject {
  spec: {
    volumeSnapshotClassName: string,
    source: {
      persistentVolumeClaimName: string
    }
  }
}

export const takeSnapshots = async (k8sApi: k8s.KubernetesObjectApi, pvcList: string) => {
  const timestamp = new Date().getTime();
  pvcList
  .split(',')
  .forEach(async pvc => await takeSnapshot(k8sApi, pvc, timestamp))
}

const takeSnapshot = async (k8sApi: k8s.KubernetesObjectApi, pvcName: string, timestamp: number) => {  
  const snapshotYaml: VolumeSnapshot = {
    apiVersion: "snapshot.storage.k8s.io/v1",
    kind: "VolumeSnapshot",
    metadata: {
      name: `${pvcName}-backup-${timestamp}`,
    },
    spec: {
      volumeSnapshotClassName: "csi-aws-vsc",
      source: {
        persistentVolumeClaimName: pvcName,
      },
    },

  };
  await k8sApi.create(snapshotYaml)
};
