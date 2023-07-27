import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { CoinServiceArgs, Outputs, getConfig } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'thorchain'
  const sampleEnv = readFileSync('../../../cmd/thorchain/sample.env')
  const { kubeconfig, config, namespace } = await getConfig()

  const coinServiceArgs = config.statefulService?.services?.map((service): CoinServiceArgs => {
    switch (service.name) {
      case 'daemon':
        return {
          ...service,
          dataDir: '/root',
          env: {
            CHAIN_ID: `${coinstack}-${config.network}-v1`,
            NET: config.network,
          },
          ports: {
            'daemon-api': { port: 1317, pathPrefix: '/lcd', stripPathPrefix: true },
            'daemon-rpc': { port: 27147, pathPrefix: '/rpc', stripPathPrefix: true },
          },
        }
      case 'indexer':
        return {
          ...service,
          dataDir: '/blockstore',
          env: {
            MIDGARD_BLOCKSTORE_LOCAL: '/blockstore',
            MIDGARD_BLOCKSTORE_REMOTE:
              'https://storage.googleapis.com/public-snapshots-ninerealms/midgard-blockstore/mainnet/v2/',
          },
          ports: { midgard: { port: 8080 } },
          configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
          volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
          useMonitorContainer: true,
        }
      case 'timescaledb':
        return {
          ...service,
          dataDir: '/var/lib/postgresql/data',
          env: {
            POSTGRES_DB: 'midgard',
            POSTGRES_USER: 'midgard',
            POSTGRES_PASSWORD: 'password',
            PGDATA: '/var/lib/postgresql/data/pgdata',
          },
          ports: { postgres: { port: 5432 } },
          volumeMounts: [{ name: 'dshm', mountPath: '/dev/shm' }],
        }
      default:
        throw new Error(`no support for coin service: ${service.name}`)
    }
  })

  const volumes = [{ name: 'dshm', emptyDir: { medium: 'Memory', sizeLimit: '1Gi' } }]

  return deployCoinstack({
    appName,
    coinServiceArgs,
    coinstack,
    coinstackType: 'go',
    config,
    kubeconfig,
    namespace,
    sampleEnv,
    volumes,
  })
}
