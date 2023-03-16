import * as k8s from '@kubernetes/client-node'

import { takeSnapshots } from './snapshot'
import { getCurrentReplicas, scaleStatefulSet } from './scaling'
import { cleanup } from './cleanup'
import { HttpError } from '@kubernetes/client-node'

interface Options {
  pvcList: string
  backupCount: number
  namespace: string
  statefulset: string
}

export const runBackup = async (opts: Options) => {
  console.log('Running backup with the following args: ', opts)
  const kc = new k8s.KubeConfig()
  kc.loadFromDefault()
  const k8sObjectClient = k8s.KubernetesObjectApi.makeApiClient(kc)
  const k8sAppsClient = kc.makeApiClient(k8s.AppsV1Api)
  const replicas = await getCurrentReplicas(k8sAppsClient, opts.statefulset, opts.namespace)

  try {
    await scaleStatefulSet(k8sAppsClient, opts.statefulset, opts.namespace, replicas - 1, true)
    await takeSnapshots(k8sObjectClient, opts.statefulset, opts.pvcList)
    await scaleStatefulSet(k8sAppsClient, opts.statefulset, opts.namespace, replicas, false)
    await cleanup(k8sObjectClient, opts.statefulset, opts.namespace, opts.pvcList, opts.backupCount)
    console.log('Backup runner completed')
  } catch (err) {
    if (err instanceof HttpError) {
      console.error('K8s operation failed:', err.body)
    } else {
      console.error(err)
    }
  }
}
