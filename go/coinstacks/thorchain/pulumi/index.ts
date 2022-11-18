import { parse } from 'dotenv'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'
import { deployApi, createService, deployStatefulService, getConfig, Service } from '../../../../pulumi'
import { api } from '../../../pulumi'

type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const name = 'unchained'
  const coinstack = 'thorchain'

  const { kubeconfig, config, namespace } = await getConfig(coinstack)

  const asset = config.network !== 'mainnet' ? `${coinstack}-${config.network}` : coinstack
  const provider = new k8s.Provider('kube-provider', { kubeconfig })
  const outputs: Outputs = {}

  const missingKeys: Array<string> = []
  const stringData = Object.keys(parse(readFileSync(`../../../cmd/${coinstack}/sample.env`))).reduce((prev, key) => {
    const value = process.env[key]

    if (!value) {
      missingKeys.push(key)
      return prev
    }

    return { ...prev, [key]: value }
  }, {})

  if (missingKeys.length) {
    throw new Error(`Missing the following required environment variables: ${missingKeys.join(', ')}`)
  }

  new k8s.core.v1.Secret(asset, { metadata: { name: asset, namespace }, stringData }, { provider })

  await deployApi({
    app: name,
    asset,
    buildAndPushImageArgs: { context: '../../../../go', dockerFile: '../../../build/Dockerfile' },
    config,
    container: { args: ['-swagger', 'swagger.json'] },
    getHash: api.getHash,
    namespace,
    provider,
    secretEnvs: api.secretEnvs,
  })

  if (config.statefulService) {
    const services = config.statefulService.services.reduce<Record<string, Service>>((prev, service) => {
      if (service.name === 'daemon') {
        prev[service.name] = createService({
          asset,
          config: service,
          dataDir: '/root',
          env: { 'CHAIN_ID': `${coinstack}-${config.network}-v1`, 'NET': config.network },
          ports: {
            'daemon-api': { port: 1317, pathPrefix: '/lcd', stripPathPrefix: true },
            'daemon-rpc': { port: 27147, pathPrefix: '/rpc', stripPathPrefix: true }
          }
        })
      }

      if (service.name === 'indexer') {
        prev[service.name] = createService({
          asset,
          config: service,
          dataDir: '/blockstore',
          env: { 'MIDGARD_BLOCKSTORE_LOCAL': '/blockstore' },
          ports: { 'midgard': { port: 8080 } },
          configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
          volumeMounts: [{ name: 'config-map', 'mountPath': '/config.json', subPath: 'indexer-config.json' }]
        })
      }

      if (service.name === 'timescaledb') {
        prev[service.name] = createService({
          asset,
          config: service,
          dataDir: '/var/lib/postgresql/data',
          env: {
            'POSTGRES_DB': 'midgard',
            'POSTGRES_USER': 'midgard',
            'POSTGRES_PASSWORD': 'password',
            'PGDATA': '/var/lib/postgresql/data/pgdata'
          },
          ports: { 'postgres': { port: 5432 } },
          volumeMounts: [{ name: 'dshm', mountPath: '/dev/shm' }]
        })
      }

      return prev
    }, {})

    const volumes = [{ name: 'dshm', emptyDir: { medium: 'Memory', sizeLimit: '1Gi' } }]

    await deployStatefulService(name, asset, provider, namespace, config, services, volumes)
  }

  return outputs
}
