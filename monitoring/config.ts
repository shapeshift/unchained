import * as pulumi from '@pulumi/pulumi'
import { BaseConfig, Cluster } from '@shapeshiftoss/common-pulumi'

export interface MonitoringConfig extends BaseConfig{
  stack: string
  environment: string
}

export interface LoopConfig {
  kubeconfig: string
  config: MonitoringConfig
  namespace: string
}
//KEVIN: Need to refactor these function calls, likely don't need to be async?
export const getConfig = async (): Promise<LoopConfig> => {
  let config: MonitoringConfig
  try {
    config = new pulumi.Config('unchained').requireObject<MonitoringConfig>('monitoring')
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

  config.cluster = (await stackReference.getOutputValue('cluster')) as Cluster
  if (config.cluster !== "eks") {
    throw new Error(
      `Error: cluster: ${config.cluster} is not supported by the monitoring stack. At the moment EKS is the only supported cluster type`
    )
  }
 
  const missingRequiredConfig: Array<string> = []

  if (!config.stack) missingRequiredConfig.push('stack')

  if (missingRequiredConfig.length) {
    throw new Error(
      `Missing the following configuration values from Pulumi.${pulumi.getStack()}.yaml: ${missingRequiredConfig.join(
        ', '
      )}`
    )
  }

  return { kubeconfig, config, namespace }
}
