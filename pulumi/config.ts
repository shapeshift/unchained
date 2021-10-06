import * as pulumi from '@pulumi/pulumi'
import { BaseConfig } from '@shapeshiftoss/common-pulumi'
import { EKSClusterLauncherArgs } from '@shapeshiftoss/cluster-launcher'
import { RabbitConfig } from './rabbit'

export interface Config extends BaseConfig {
  eks: Omit<EKSClusterLauncherArgs, 'rootDomainName'>
  rabbit?: RabbitConfig
}

let config: Config
try {
  config = new pulumi.Config('unchained').requireObject<Config>('common')
} catch (e) {
  throw new pulumi.RunError(
    `Could not find required configuration file. \n\tDid you copy the Pulumi.sample.yaml file to Pulumi.${pulumi.getStack()}.yaml and update the necessary configuration?`
  )
}

const getStorageClassName = (cluster: string) => {
  switch (cluster) {
    case 'docker-desktop':
      return 'hostpath'
    case 'minikube':
      return 'standard'
    case 'eks':
      return 'gp2'
    default:
      throw new pulumi.RunError(`Cluster ${cluster} not supported... Use: 'docker-desktop', 'minikube', or 'eks.`)
  }
}

if (config.rabbit !== undefined) config.rabbit.storageClassName = getStorageClassName(config.cluster)
if (config.isLocal === undefined) config.isLocal = true

const missingRequiredConfig: Array<string> = []

if (config.isLocal === false) {
  if (!config.rootDomainName) missingRequiredConfig.push('rootDomainName')
  if (!config.eks.instanceTypes) missingRequiredConfig.push('eks.instanceTypes')
  if (config.eks.autoscaling) {
    if (config.eks.autoscaling.enabled === undefined) missingRequiredConfig.push('eks.autoscaling.enabled')
    if (config.eks.autoscaling.minInstances === undefined) missingRequiredConfig.push('eks.autoscaling.minInstances')
    if (config.eks.autoscaling.maxInstances === undefined) missingRequiredConfig.push('eks.autoscaling.maxInstances')
  }
}

if (missingRequiredConfig.length) {
  throw new pulumi.RunError(
    `Missing the following configuration values from Pulumi.${pulumi.getStack()}.yaml: ${missingRequiredConfig.join(
      ', '
    )}`
  )
}

export default config
