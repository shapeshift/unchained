import * as pulumi from '@pulumi/pulumi'
import { Config as BaseConfig, Cluster, Dockerhub } from '../../../pulumi/src'

const SUPPORTED_NETWORKS = ['mainnet']

export interface Config {
  kubeconfig: string
  config: BaseConfig
  namespace: string
}

export const getConfig = async (): Promise<Config> => {
  let config: BaseConfig
  try {
    config = new pulumi.Config('unchained').requireObject<BaseConfig>('osmosis')
  } catch (e) {
    throw new pulumi.RunError(
      `Could not find required configuration file. \n\tDid you copy the Pulumi.sample.yaml file to Pulumi.${pulumi.getStack()}.yaml and update the necessary configuration?`
    )
  }

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

  config.isLocal = (await stackReference.getOutputValue('isLocal')) as boolean
  config.cluster = (await stackReference.getOutputValue('cluster')) as Cluster
  config.dockerhub = (await stackReference.getOutputValue('dockerhub')) as Dockerhub
  config.rootDomainName = (await stackReference.getOutputValue('rootDomainName')) as string

  const missingRequiredConfig: Array<string> = []

  if (!config.stack) missingRequiredConfig.push('stack')

  if (!config.network || !SUPPORTED_NETWORKS.includes(config.network)) {
    missingRequiredConfig.push(`network (${SUPPORTED_NETWORKS})`)
  }

  if (config.api) {
    if (config.api.autoscaling) {
      if (config.api.autoscaling.enabled === undefined) missingRequiredConfig.push('api.autoscaling.enabled')
      if (config.api.autoscaling.maxReplicas === undefined) missingRequiredConfig.push('api.autoscaling.maxReplicas')
      if (config.api.autoscaling.cpuThreshold === undefined) missingRequiredConfig.push('api.autoscaling.cpuThreshold')
    }

    if (config.api.cpuLimit === undefined) missingRequiredConfig.push('api.cpuLimit')
    if (config.api.memoryLimit === undefined) missingRequiredConfig.push('api.memoryLimit')
    if (config.api.replicas === undefined) missingRequiredConfig.push('api.replicas')
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
