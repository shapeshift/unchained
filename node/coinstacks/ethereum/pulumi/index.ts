import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, ServiceArgs, getConfig } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'ethereum'
  const sampleEnv = readFileSync('../sample.env')
  const { kubeconfig, config, namespace } = await getConfig()
  const coinServiceInput: ServiceArgs[] = [
    {
      coinServiceName: 'daemon',
      ports: {
        'daemon-rpc': { port: 8332 },
        'daemon-ws': { port: 8333, pathPrefix: '/websocket', stripPathPrefix: true },
        'daemon-beacon': { port: 8551, ingressRoute: false },
      },
      configMapData: { 'jwt.hex': readFileSync('../daemon/jwt.hex').toString() },
      volumeMounts: [{ name: 'config-map', mountPath: '/jwt.hex', subPath: 'jwt.hex' }],
    },
    {
      coinServiceName: 'daemon-beacon',
      args: [
        '--datadir',
        '/data',
        '--execution-endpoint',
        'http://localhost:8551',
        '--jwt-secret',
        '/jwt.hex',
        '--accept-terms-of-use',
      ],
      volumeMounts: [{ name: 'config-map', mountPath: '/jwt.hex', subPath: 'jwt.hex' }],
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
      readinessProbe: { initialDelaySeconds: 20, periodSeconds: 5, failureThreshold: 12 },
      livenessProbe: { timeoutSeconds: 10, initialDelaySeconds: 60, periodSeconds: 15, failureThreshold: 4 },
    },
  ]

  return await deployCoinstack(kubeconfig, config, namespace, appName, coinstack, coinServiceInput, sampleEnv, 'node')
}
