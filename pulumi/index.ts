import { hashElement } from 'folder-hash'
import { core, Provider } from '@pulumi/kubernetes'
import { buildAndPushImage, hasTag, getBaseHash } from '@shapeshiftoss/common-pulumi'
import { EKSClusterLauncher } from '@shapeshiftoss/cluster-launcher'
import { deployWatcher } from './watcher'
import config from './config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const name = 'unchained'
  const defaultNamespace = 'unchained'
  const outputs: Outputs = {}

  let provider: Provider
  if (config.isLocal) {
    const { cluster } = config
    provider = new Provider(cluster, { cluster, context: cluster })

    await deployWatcher(name, provider, defaultNamespace)
  } else {
    if (!config.rootDomainName) throw new Error('rootDomainName required')

    const cluster = await EKSClusterLauncher.create(name, {
      allAZs: config.eks.allAZs,
      autoscaling: config.eks.autoscaling,
      cidrBlock: config.eks.cidrBlock,
      email: config.eks.email,
      instanceTypes: config.eks.instanceTypes,
      logging: config.eks.logging,
      numInstancesPerAZ: config.eks.numInstancesPerAZ,
      profile: config.eks.profile,
      region: config.eks.region,
      rootDomainName: config.rootDomainName,
      traefik: config.eks.traefik,
    })

    outputs.kubeconfig = cluster.kubeconfig

    provider = new Provider('kube-provider', { kubeconfig: cluster.kubeconfig })

    if (config.dockerhub) {
      const baseImage = `${config.dockerhub.username}/${name}-base`
      const baseTag = await getBaseHash()

      if (!(await hasTag(baseImage, baseTag))) {
        await buildAndPushImage({
          image: baseImage,
          context: '../',
          auth: {
            password: config.dockerhub.password,
            username: config.dockerhub.username,
            server: config.dockerhub.server,
          },
          buildArgs: { BUILDKIT_INLINE_CACHE: '1' },
          env: { DOCKER_BUILDKIT: '1' },
          tags: [baseTag],
          cacheFroms: [`${baseImage}:${baseTag}`, `${baseImage}:latest`],
        })
      }

      const blockbookImage = `${config.dockerhub.username}/${name}-blockbook`
      const { hash: blockbookTag } = await hashElement(`../packages/blockbook/Dockerfile`, { encoding: 'hex' })

      if (!(await hasTag(blockbookImage, blockbookTag))) {
        await buildAndPushImage({
          image: blockbookImage,
          context: '../packages/blockbook',
          auth: {
            password: config.dockerhub.password,
            username: config.dockerhub.username,
            server: config.dockerhub.server,
          },
          buildArgs: { BUILDKIT_INLINE_CACHE: '1' },
          env: { DOCKER_BUILDKIT: '1' },
          tags: [blockbookTag],
          cacheFroms: [`${blockbookImage}:${blockbookTag}`, `${blockbookImage}:latest`],
        })
      }
    }
  }

  const namespaces: Array<string> = [defaultNamespace]
  if (config.additionalEnvironments?.length) {
    config.additionalEnvironments.forEach((env) => namespaces.push(`${defaultNamespace}-${env}`))
  }

  namespaces.forEach(async (namespace) => {
    new core.v1.Namespace(namespace, { metadata: { name: namespace } }, { provider })
  })

  outputs.cluster = config.cluster
  outputs.isLocal = config.isLocal
  outputs.dockerhub = config.dockerhub
  outputs.rootDomainName = config.rootDomainName
  outputs.namespaces = namespaces
  outputs.defaultNamespace = defaultNamespace

  return outputs
}
