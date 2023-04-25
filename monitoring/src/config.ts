import * as pulumi from '@pulumi/pulumi'

export interface MonitoringConfig {
  stack: string
  environment: string
}

export interface LoopConfig {
  kubeconfig: string
  config: MonitoringConfig
  namespace: string
  domain: string
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
  const domain = (await stackReference.getOutputValue('rootDomainName')) as string

  const namespace = config.environment ? `${defaultNamespace}-${config.environment}` : defaultNamespace
  if (!namespaces.includes(namespace)) {
    throw new Error(
      `Error: environment: ${config.environment} not found in cluster. Either remove to use default environment or verify environment exists`
    )
  }

  const missingRequiredConfig: Array<string> = []

  if (missingRequiredConfig.length) {
    throw new Error(
      `Missing the following configuration values from Pulumi.${pulumi.getStack()}.yaml: ${missingRequiredConfig.join(
        ', '
      )}`
    )
  }

  return { kubeconfig, config, namespace, domain }
}
