import * as pulumi from '@pulumi/pulumi'
import { BaseConfig } from '@shapeshiftoss/common-pulumi'
import { EKSClusterLauncherArgs } from '@shapeshiftoss/cluster-launcher'
import { RabbitConfig } from './rabbit'

export interface Config extends BaseConfig {
  eks: Omit<EKSClusterLauncherArgs, 'rootDomainName'>
  rabbit?: RabbitConfig
}

const config = new pulumi.Config('unchained').requireObject<Config>('common')

const getStorageClassName = (cluster: string) => {
  switch (cluster) {
    case 'docker-desktop':
      return 'hostpath'
    case 'minikube':
      return 'standard'
    case 'eks':
      return 'gp2'
    default:
      throw new Error(`cluster not supported... Use: 'docker-desktop', 'minikube', or 'eks.`)
  }
}

if (config.rabbit !== undefined) config.rabbit.storageClassName = getStorageClassName(config.cluster)
if (config.isLocal === undefined) config.isLocal = true

const missingRequiredConfig: Array<string> = []

if (config.isLocal === false) {
  if (!config.rootDomainName) missingRequiredConfig.push('rootDomainName')
  if (!config.eks.instanceTypes) missingRequiredConfig.push('eks.instanceTypes')
}

if (missingRequiredConfig.length) {
  throw new Error(
    `Missing the following configuration values from Pulumi.${pulumi.getStack()}.yaml: ${missingRequiredConfig.join(
      ', '
    )}`
  )
}

export default config
