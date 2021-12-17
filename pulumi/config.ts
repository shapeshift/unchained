import * as pulumi from '@pulumi/pulumi'
import { BaseConfig } from '@shapeshiftoss/common-pulumi'
import { EKSClusterLauncherArgs } from '@shapeshiftoss/cluster-launcher'

export interface Config extends BaseConfig {
  eks: Omit<EKSClusterLauncherArgs, 'rootDomainName'>
}

let config: Config
try {
  config = new pulumi.Config('unchained').requireObject<Config>('common')
} catch (e) {
  throw new pulumi.RunError(
    `Could not find required configuration file. \n\tDid you copy the Pulumi.sample.yaml file to Pulumi.${pulumi.getStack()}.yaml and update the necessary configuration?`
  )
}

if (config.isLocal === undefined) config.isLocal = true

const missingRequiredConfig: Array<string> = []

if (config.isLocal === false) {
  if (!config.rootDomainName) missingRequiredConfig.push('rootDomainName')
  if (!config.eks.nodeGroups) missingRequiredConfig.push('eks.nodeGroups')
}

if (missingRequiredConfig.length) {
  throw new pulumi.RunError(
    `Missing the following configuration values from Pulumi.${pulumi.getStack()}.yaml: ${missingRequiredConfig.join(
      ', '
    )}`
  )
}

export default config
