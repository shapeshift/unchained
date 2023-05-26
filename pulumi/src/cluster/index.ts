import * as pulumi from '@pulumi/pulumi'
import { core, Provider } from '@pulumi/kubernetes'
import { EKSClusterLauncher, EKSClusterLauncherArgs } from '@shapeshiftoss/cluster-launcher'
import { BaseConfig } from '..'
import { buildAndPushDockerImages } from './docker'
import { deployIpfs } from '../ipfs/ipfs'

interface Config extends BaseConfig {
  cluster: 'eks'
  eks: Omit<EKSClusterLauncherArgs, 'rootDomainName'>
}

const config = (() => {
  try {
    return new pulumi.Config('unchained').requireObject<Config>('common')
  } catch (e) {
    throw new pulumi.RunError(
      `Could not find required configuration file. \n\tDid you copy the Pulumi.sample.yaml file to Pulumi.${pulumi.getStack()}.yaml and update the necessary configuration?`
    )
  }
})()

const missingRequiredConfig: Array<string> = []

if (!config.rootDomainName) missingRequiredConfig.push('rootDomainName')
if (!config.eks.nodeGroups) missingRequiredConfig.push('eks.nodeGroups')

if (missingRequiredConfig.length) {
  throw new pulumi.RunError(
    `Missing the following configuration values from Pulumi.${pulumi.getStack()}.yaml: ${missingRequiredConfig.join(
      ', '
    )}`
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const name = 'unchained'
  const defaultNamespace = 'unchained'
  const outputs: Outputs = {}

  if (!config.rootDomainName) throw new Error('rootDomainName required')

  const cluster = await EKSClusterLauncher.create(name, {
    allAZs: config.eks.allAZs,
    autoscaling: config.eks.autoscaling,
    cidrBlock: config.eks.cidrBlock,
    email: config.eks.email,
    nodeGroups: config.eks.nodeGroups,
    logging: config.eks.logging,
    profile: config.eks.profile,
    region: config.eks.region,
    rootDomainName: config.rootDomainName,
    traefik: config.eks.traefik,
    volumeSize: config.eks.volumeSize,
  })

  outputs.kubeconfig = cluster.kubeconfig

  const provider = new Provider('kube-provider', { kubeconfig: cluster.kubeconfig })

  if (config.dockerhub) {
    buildAndPushDockerImages(config.dockerhub, name)
  }

  const namespaces: Array<string> = [defaultNamespace]
  if (config.additionalEnvironments?.length) {
    config.additionalEnvironments.forEach((env) => namespaces.push(`${defaultNamespace}-${env}`))
  }

  namespaces.forEach(async (namespace) => {
    new core.v1.Namespace(namespace, { metadata: { name: namespace } }, { provider })
  })

  deployIpfs({
    namespace: 'unchained-infra',
    domain: config.rootDomainName,
    additionalDomain: process.env.ADDITIONAL_ROOT_DOMAIN_NAME,
    provider,
  })

  outputs.cluster = config.cluster
  outputs.dockerhub = config.dockerhub
  outputs.rootDomainName = config.rootDomainName
  outputs.namespaces = namespaces
  outputs.defaultNamespace = defaultNamespace

  return outputs
}
