import { createHash } from 'crypto'
import { hashElement } from 'folder-hash'
import { core, Provider } from '@pulumi/kubernetes'
import { buildAndPushImage, hasTag } from '@shapeshiftoss/common-pulumi'
import { EKSClusterLauncher } from '@shapeshiftoss/cluster-launcher'
import { deployRabbit } from './rabbit'
import { deployWatcher } from './watcher'
import config from './config'

// creates a hash of the content included in the final build image (base)
const getHashBase = async (): Promise<string> => {
  const hash = createHash('sha1')

  // hash root level unchained files
  const { hash: unchainedHash } = await hashElement(`../`, {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['package.json', 'lerna.json'] },
  })
  hash.update(unchainedHash)

  // hash contents of packages
  const { hash: packagesHash } = await hashElement(`../packages`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(packagesHash)

  // hash contents of common-ingester
  const { hash: commonHash } = await hashElement(`../coinstacks/common`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(commonHash)

  return hash.digest('hex')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const app = 'unchained'
  const namespace = 'unchained'
  const outputs: Outputs = {}

  let provider: Provider
  if (config.isLocal) {
    const { cluster } = config
    provider = new Provider(cluster, { cluster, context: cluster })

    await deployWatcher(app, provider, namespace)
  } else {
    if (!config.rootDomainName) throw new Error('rootDomainName required')

    const cluster = await EKSClusterLauncher.create(app, {
      rootDomainName: config.rootDomainName,
      instanceTypes: config.eks.instanceTypes,
      allAZs: config.eks.allAZs,
      region: config.eks.region,
      cidrBlock: config.eks.cidrBlock,
      profile: config.eks.profile,
    })

    outputs.kubeconfig = cluster.kubeconfig

    provider = new Provider('kube-provider', { kubeconfig: cluster.kubeconfig })

    if (config.dockerhub) {
      const baseImage = `${config.dockerhub.username}/${app}-base`
      const baseTag = await getHashBase()

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

      const blockbookImage = `${config.dockerhub.username}/${app}-blockbook`
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

  new core.v1.Namespace(namespace, { metadata: { name: app } }, { provider })

  await deployRabbit(app, provider, namespace, config)

  outputs.cluster = config.cluster
  outputs.isLocal = config.isLocal
  outputs.dockerhub = config.dockerhub
  outputs.rootDomainName = config.rootDomainName

  return outputs
}
