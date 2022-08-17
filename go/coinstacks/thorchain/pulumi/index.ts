import { parse } from 'dotenv'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'
import { createService, deployApi, deployStatefulService, getConfig, Service } from '../../../pulumi/src'

type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const { kubeconfig, config, namespace } = await getConfig('thorchain')

  const name = 'unchained'
  const asset = config.network !== 'mainnet' ? `thorchain-${config.network}` : 'thorchain'
  const outputs: Outputs = {}

  const provider = new k8s.Provider('kube-provider', { kubeconfig })

  const missingKeys: Array<string> = []
  const stringData = Object.keys(parse(readFileSync('../../../cmd/thorchain/sample.env'))).reduce((prev, key) => {
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

  await deployApi(name, asset, provider, namespace, config)

  if (config.statefulService) {
    const services = config.statefulService.services.reduce<Record<string, Service>>((prev, service) => {
      if (service.name === 'daemon') {
        prev.daemon = createService({
          asset,
          config: service,
          dataDir: '/root',
          env: { 'CHAIN_ID': `thorchain-${config.network}-v1`, 'NET': config.network },
          name: 'daemon',
          ports: { 'daemon-api': { port: 1317, pathPrefix: '/thorchain' }, 'daemon-rpc': { port: 27147 } }
        })
      }

      if (service.name === 'midgard') {
        prev.midgard = createService({
          asset,
          config: service,
          dataDir: '/blockstore',
          env: {
            'MIDGARD_BLOCKSTORE_LOCAL': '/blockstore',
            'MIDGARD_BLOCKSTORE_REMOTE': 'https://storage.googleapis.com/public-snapshots-ninerealms/midgard-blockstore/mainnet/v2/'
          },
          name: 'midgard',
          ports: { 'midgard': { port: 8080 } }
        })
      }

      if (service.name === 'timescaledb') {
        prev.timescaledb = createService({
          asset,
          config: service,
          dataDir: '/var/lib/postgresql/data',
          env: {
            'POSTGRES_DB': 'midgard',
            'POSTGRES_USER': 'midgard',
            'POSTGRES_PASSWORD': 'password',
            'PGDATA': '/var/lib/postgresql/data/pgdata'
          },
          name: 'timescaledb',
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
