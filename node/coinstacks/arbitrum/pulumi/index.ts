import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, CoinServiceArgs, getConfig } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'arbitrum'
  const sampleEnv = readFileSync('../sample.env')
  const { kubeconfig, config, namespace } = await getConfig()

  const coinServiceArgs = config.statefulService?.services?.map((service): CoinServiceArgs => {
    switch (service.name) {
      case 'daemon':
        return {
          ...service,
          ports: {
            'daemon-http': { port: 8545 },
            'daemon-ws': { port: 8546, pathPrefix: '/websocket', stripPathPrefix: true },
          },
          env: {
            L1_RPC_ENDPOINT: `http://ethereum-svc.${namespace}.svc.cluster.local:8332`,
          },
          dataDir: '/root/.arbitrum',
          configMapData: { 'jwt.hex': readFileSync('../daemon/jwt.hex').toString() },
          readinessProbe: { httpGet: { path: '/health', port: 8545 }, timeoutSeconds: 5 },
          volumeMounts: [{ name: 'config-map', mountPath: '/jwt.hex', subPath: 'jwt.hex' }],
        }
      // case 'indexer':
      //   return {
      //     ...service,
      //     command: [
      //       '/bin/blockbook',
      //       '-blockchaincfg=/config.json',
      //       '-datadir=/data',
      //       '-sync',
      //       '-public=:8001',
      //       '-enablesubnewtx',
      //       '-logtostderr',
      //       '-debug',
      //     ],
      //     ports: { public: { port: 8001 } },
      //     configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
      //     volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
      //     readinessProbe: { initialDelaySeconds: 20, periodSeconds: 5, failureThreshold: 12 },
      //     livenessProbe: { timeoutSeconds: 10, initialDelaySeconds: 60, periodSeconds: 15, failureThreshold: 4 },
      //   }
      default:
        throw new Error(`no support for coin service: ${service.name}`)
    }
  })

  return deployCoinstack({
    appName,
    coinServiceArgs,
    coinstack,
    coinstackType: 'node',
    config,
    kubeconfig,
    namespace,
    sampleEnv,
  })
}
