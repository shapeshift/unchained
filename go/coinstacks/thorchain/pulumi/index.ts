import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { CoinstackType } from '../../../../pulumi/src/hash'
import { Outputs, ServiceInput } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'thorchain'
  const sampleEnv = readFileSync('../sample.env')
  const coinServiceInput: ServiceInput[] = [
    {
      coinServiceName: 'daemon',
      dataDir: '/root',
      ports: {
        'daemon-api': { port: 1317, pathPrefix: '/lcd', stripPathPrefix: true },
        'daemon-rpc': { port: 27147, pathPrefix: '/rpc', stripPathPrefix: true },
      },
    },
    {
      coinServiceName: 'indexer',
      dataDir: '/blockstore',
      env: { MIDGARD_BLOCKSTORE_LOCAL: '/blockstore' },
      ports: { midgard: { port: 8080 } },
      configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
      volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
    },
    {
      coinServiceName: 'timescaledb',
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
  ]

  const volumes = [{ name: 'dshm', emptyDir: { medium: 'Memory', sizeLimit: '1Gi' } }]

  return await deployCoinstack(appName, coinstack, coinServiceInput, sampleEnv, CoinstackType.GO, volumes)
}