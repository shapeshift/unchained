import * as pulumi from '@pulumi/pulumi'
import { Config as BaseConfig, Dockerhub } from '.'

const SUPPORTED_NETWORKS = ['mainnet']

export interface Config {
  kubeconfig: string
  config: BaseConfig
  namespace: string
}

export const getConfig = async (coinstack: string): Promise<Config> => {
  const config = (() => {
    try {
      return new pulumi.Config('unchained').requireObject<BaseConfig>(coinstack)
    } catch (e) {
      throw new pulumi.RunError('Could not find required configuration file')
    }
  })()

  const stackReference = new pulumi.StackReference(config.stack)
  const kubeconfig = (await stackReference.getOutputValue('kubeconfig')) as string
  const namespaces = (await stackReference.getOutputValue('namespaces')) as Array<string>
  const defaultNamespace = (await stackReference.getOutputValue('defaultNamespace')) as string

  const namespace = config.environment ? `${defaultNamespace}-${config.environment}` : defaultNamespace
  if (!namespaces.includes(namespace)) {
    throw new Error(
      `Error: environment: ${config.environment} not found in cluster. Either remove to use default environment or verify environment exists`
    )
  }

  config.dockerhub = (await stackReference.getOutputValue('dockerhub')) as Dockerhub
  config.rootDomainName = (await stackReference.getOutputValue('rootDomainName')) as string

  const missingRequiredConfig: Array<string> = []

  if (!config.stack) missingRequiredConfig.push('stack')

  if (!config.network || !SUPPORTED_NETWORKS.includes(config.network)) {
    missingRequiredConfig.push(`network (${SUPPORTED_NETWORKS})`)
  }

  if (config.api) {
    if (config.api?.autoscaling) {
      if (config.api?.autoscaling?.enabled === undefined) missingRequiredConfig.push('api.autoscaling.enabled')
      if (config.api?.autoscaling?.maxReplicas === undefined) missingRequiredConfig.push('api.autoscaling.maxReplicas')
      if (config.api?.autoscaling?.cpuThreshold === undefined) missingRequiredConfig.push('api.autoscaling.cpuThreshold')
    }

    if (config.api?.cpuLimit === undefined) missingRequiredConfig.push('api.cpuLimit')
    if (config.api?.memoryLimit === undefined) missingRequiredConfig.push('api.memoryLimit')
    if (config.api?.replicas === undefined) missingRequiredConfig.push('api.replicas')
  }

  if (config.statefulService) {
    if (config.statefulService?.replicas === undefined) missingRequiredConfig.push('statefulService.replicas')

    config.statefulService?.services.forEach((service, i) => {
      if (service.cpuLimit === undefined) missingRequiredConfig.push(`statefulService.services.[${i}].cpuLimit`)
      if (service.image === undefined) missingRequiredConfig.push(`statefulService.services.[${i}].image`)
      if (service.memoryLimit === undefined) missingRequiredConfig.push(`statefulService.services.[${i}].memoryLimit`)
      if (service.name === undefined) missingRequiredConfig.push(`statefulService.services.[${i}].name`)
      if (service.storageSize === undefined) missingRequiredConfig.push(`statefulService.services.[${i}].storageSize`)
    })
  }

  if (missingRequiredConfig.length) {
    throw new Error(
      `Missing the following configuration values from Pulumi.${pulumi.getStack()}.yaml: ${missingRequiredConfig.join(
        ', '
      )}`
    )
  }

  return { kubeconfig, config, namespace }
}
