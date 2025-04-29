import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { CoinServiceArgs, Outputs, getConfig } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'mayachain'
  const sampleEnv = readFileSync('../../../cmd/mayachain/sample.env')
  const { kubeconfig, config, namespace } = await getConfig()

  const coinServiceArgs = config.statefulService?.services?.map((service): CoinServiceArgs => {
    switch (service.name) {
      case 'daemon':
        return {
          ...service,
          dataDir: '/root',
          env: {
            CHAIN_ID: 'mayachain-mainnet-v1',
            NET: config.network,
          },
          ports: {
            'daemon-api': { port: 1317, pathPrefix: '/lcd', stripPathPrefix: true },
            'daemon-rpc': { port: 27147, pathPrefix: '/rpc', stripPathPrefix: true },
          },
          configMapData: { 'tendermint.sh': readFileSync('../../../scripts/tendermint.sh').toString() },
          volumeMounts: [{ name: 'config-map', mountPath: '/tendermint.sh', subPath: 'tendermint.sh' }],
          startupProbe: { periodSeconds: 30, failureThreshold: 60, timeoutSeconds: 10 },
          livenessProbe: { periodSeconds: 30, failureThreshold: 5, timeoutSeconds: 10 },
          readinessProbe: { periodSeconds: 30, failureThreshold: 10, timeoutSeconds: 10 },
        }
      case 'indexer':
        return {
          ...service,
          dataDir: '/blockstore',
          env: {
            MIDGARD_BLOCKSTORE_LOCAL: '/blockstore',
            MIDGARD_BLOCKSTORE_REMOTE: 'https://snapshots.mayachain.info/midgard-blockstore/',
          },
          ports: { midgard: { port: 8080 } },
          configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
          volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
          useMonitorContainer: true,
          startupProbe: { tcpSocket: { port: 8080 }, periodSeconds: 30, failureThreshold: 60, timeoutSeconds: 10 },
          livenessProbe: { tcpSocket: { port: 8080 }, periodSeconds: 30, failureThreshold: 5, timeoutSeconds: 10 },
          readinessProbe: { periodSeconds: 30, failureThreshold: 10, timeoutSeconds: 10 },
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
          startupProbe: {
            exec: { command: ['pg_isready', '-U', 'midgard'] },
            periodSeconds: 30,
            failureThreshold: 10,
            timeoutSeconds: 5,
          },
          livenessProbe: {
            exec: { command: ['pg_isready', '-U', 'midgard'] },
            periodSeconds: 30,
            timeoutSeconds: 5,
          },
          readinessProbe: {
            exec: { command: ['pg_isready', '-U', 'midgard'] },
            periodSeconds: 30,
            timeoutSeconds: 5,
          },
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
