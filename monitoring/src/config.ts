import * as pulumi from '@pulumi/pulumi'

export interface MonitoringConfig {
  stack: string
  environment: string
  domain: string
}

export interface LoopConfig {
  kubeconfig: string
  config: MonitoringConfig
  namespace: string
}

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

  const missingRequiredConfig: Array<string> = []

  if (!config.stack) missingRequiredConfig.push('stack')
  if (!config.domain) missingRequiredConfig.push('domain')

  if (missingRequiredConfig.length) {
    throw new Error(
      `Missing the following configuration values from Pulumi.${pulumi.getStack()}.yaml: ${missingRequiredConfig.join(
        ', '
      )}`
    )
  }

  const namespace = config.environment ? `${defaultNamespace}-${config.environment}` : defaultNamespace
  if (!namespaces.includes(namespace)) {
    throw new Error(
      `Error: environment: ${config.environment} not found in cluster. Either remove to use default environment or verify environment exists`
    )
  }

  return { kubeconfig, config, namespace }
}
