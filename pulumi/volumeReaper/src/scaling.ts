import k8s from '@kubernetes/client-node'


export const getCurrentReplicas = async (k8sAppsClient: k8s.AppsV1Api, name: string, namespace: string): Promise<number> => {
  const { body } = await k8sAppsClient.readNamespacedStatefulSetStatus(name, namespace)
  if (!body.spec?.replicas) throw new Error(`No spec found for StatefulSet: ${namespace}.${name}`)
  return body.spec?.replicas
}

export const delay = (time: number) => {
  return new Promise((resolve) => setTimeout(resolve, time))
}

export const scaleStatefulSet = async (
  k8sAppsClient: k8s.AppsV1Api,
  name: string,
  namespace: string,
  count: number,
  waitToFinish: boolean
) => {
  console.log(`Scaling StatefulSet ${namespace}.${name} to ${count} replicas`)

  const { body } = await k8sAppsClient.readNamespacedStatefulSetStatus(name, namespace)
  if (!body.spec?.replicas) throw new Error(`No spec found for StatefulSet: ${namespace}.${name}`)
  body.spec.replicas = count

  await k8sAppsClient.replaceNamespacedStatefulSet(name, namespace, body)

  if (waitToFinish) {
    await waitForScalingToFinish(k8sAppsClient, name, namespace, count)
  }
}

const waitForScalingToFinish = async (k8sAppsClient: k8s.AppsV1Api, name: string, namespace: string, count: number) => {
  for (let i = 0; i < 100; i++) {
    // termination grace period is 120s so need to account for that
    console.log(`Waiting for ${name} to shut down...`)

    await delay(3000)
    const status = await k8sAppsClient.readNamespacedStatefulSetStatus(name, namespace)

    if (status.body.status?.availableReplicas === count) {
      console.log(`Scaling finished - ${namespace}.${name} availableReplicas is now ${count}`)
      return
    }
  }
}
