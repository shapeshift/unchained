import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, ServiceArgs } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'bnbsmartchain'
  const sampleEnv = readFileSync('../sample.env')
  const coinServiceInput: ServiceArgs[] = [
    {
      coinServiceName: 'daemon',

      ports: {
        'daemon-rpc': { port: 8545 },
        'daemon-ws': { port: 8546, pathPrefix: '/websocket', stripPathPrefix: true },
      },
      readinessProbe: { initialDelaySeconds: 30, periodSeconds: 10, failureThreshold: 12 },
    },
    {
      coinServiceName: 'indexer',
      command: [
        '/bin/blockbook',
        '-blockchaincfg=/config.json',
        '-datadir=/data',
        '-sync',
        '-public=:8001',
        '-enablesubnewtx',
        '-logtostderr',
        '-debug',
      ],
      ports: { public: { port: 8001 } },
      configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
      volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
      readinessProbe: { initialDelaySeconds: 20, periodSeconds: 10, failureThreshold: 12 },
      livenessProbe: { timeoutSeconds: 10, initialDelaySeconds: 60, periodSeconds: 15, failureThreshold: 4 },
    },
  ]

  return await deployCoinstack(appName, coinstack, coinServiceInput, sampleEnv, 'node')
}
