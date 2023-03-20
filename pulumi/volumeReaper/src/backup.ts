import * as k8s from '@kubernetes/client-node'

import { takeSnapshots } from './snapshot'
import { getCurrentReplicas, scaleStatefulSet } from './scaling'
import { cleanup } from './cleanup'
import { HttpError } from '@kubernetes/client-node'
import assert from 'assert'

interface Options {
  asset: string
  stsServices: string
  backupCount: number
  namespace: string
}

export const runBackup = async (opts: Options) => {
  console.log('Running backup with the following args: ', opts)
  const kc = new k8s.KubeConfig()
  kc.loadFromDefault()
  const k8sObjectClient = k8s.KubernetesObjectApi.makeApiClient(kc)
  const k8sAppsClient = kc.makeApiClient(k8s.AppsV1Api)

  const statefulset = `${opts.asset}-sts`

  const replicas = await getCurrentReplicas(k8sAppsClient, statefulset, opts.namespace)
  assert(replicas >= 1, 'Replicas needs to be larger than 0 to run backup')

  const pvcList = opts.stsServices.split(',').map((svc) => `data-${svc}-${opts.asset}-sts-${replicas}`)
  const pvcsToKeepCount = pvcList.length * opts.backupCount

  try {
    await scaleStatefulSet(k8sAppsClient, statefulset, opts.namespace, replicas - 1, true)
    await takeSnapshots(k8sObjectClient, statefulset, pvcList)
    await scaleStatefulSet(k8sAppsClient, statefulset, opts.namespace, replicas, false)
    await cleanup(k8sObjectClient, statefulset, opts.namespace, pvcsToKeepCount)
    console.log('Backup completed')
  } catch (err) {
    if (err instanceof HttpError) {
      console.error('K8s operation failed:', err.body)
    } else {
      console.error(err)
    }
  }
}
