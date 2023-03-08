import k8s, { HttpError } from '@kubernetes/client-node'
import { takeSnapshots } from './snapshot.js'
import { scaleStatefulSet } from './scaling.js'

interface Options {
  pvcList: string
  count: number
  replicas: number
  namespace: string
  statefulset: string
}

export const runBackup = async (opts: Options) => {
  console.log('Running backup with the following args: ', opts)
  const kc = new k8s.KubeConfig()
  kc.loadFromDefault()
  const k8sObjectClient = k8s.KubernetesObjectApi.makeApiClient(kc)
  const k8sAppsClient = kc.makeApiClient(k8s.AppsV1Api)

  try {
    await scaleStatefulSet(k8sAppsClient, opts.statefulset, opts.namespace, 0, true)
    await takeSnapshots(k8sObjectClient, opts.pvcList)
    await scaleStatefulSet(k8sAppsClient, opts.statefulset, opts.namespace, 1, false)
  } catch (err) {
    if (err instanceof HttpError) {
      console.error('K8s operation failed:', err.body)
    } else {
      console.error(err)
    }
  }
}
