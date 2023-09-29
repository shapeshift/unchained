import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, CoinServiceArgs, getConfig } from '../../../../pulumi/src'
import { defaultBlockbookServiceArgs } from '../../../packages/blockbook/src/constants'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'polygon'
  const sampleEnv = readFileSync('../sample.env')
  const { kubeconfig, config, namespace } = await getConfig()

  const coinServiceArgs = config.statefulService?.services?.map((service): CoinServiceArgs => {
    switch (service.name) {
      case 'daemon':
        return {
          ...service,
          env: {
            NETWORK: config.network,
            SNAPSHOT: 'https://snapshot-download.polygon.technology/snapdown.sh',
          },
          ports: {
            'daemon-rpc': { port: 8545 },
            'daemon-ws': { port: 8546, pathPrefix: '/websocket', stripPathPrefix: true },
          },
          configMapData: { 'evm.sh': readFileSync('../../../scripts/evm.sh').toString() },
          volumeMounts: [{ name: 'config-map', mountPath: '/evm.sh', subPath: 'evm.sh' }],
          startupProbe: { periodSeconds: 30, failureThreshold: 60, timeoutSeconds: 10 },
          livenessProbe: { periodSeconds: 30, failureThreshold: 30, timeoutSeconds: 10 },
          readinessProbe: { periodSeconds: 30, failureThreshold: 20, timeoutSeconds: 10 },
        }
      case 'heimdall':
        return {
          ...service,
          dataDir: '/root',
          ports: {
            'heimdall-api': { port: 1317, pathPrefix: '/lcd', stripPathPrefix: true },
            'heimdall-rpc': { port: 26657, pathPrefix: '/rpc', stripPathPrefix: true },
          },
          env: {
            ETH_RPC_URL: `http://ethereum-svc.${namespace}.svc.cluster.local:8545`,
            SNAPSHOT: 'https://snapshot-download.polygon.technology/snapdown.sh',
          },
          startupProbe: { periodSeconds: 30, failureThreshold: 60, timeoutSeconds: 10 },
          livenessProbe: { periodSeconds: 30, failureThreshold: 5, timeoutSeconds: 10 },
          readinessProbe: { periodSeconds: 30, failureThreshold: 10, timeoutSeconds: 10 },
        }
      case 'indexer':
        return {
          ...service,
          ...defaultBlockbookServiceArgs,
          command: [...defaultBlockbookServiceArgs.command, '-workers=1'],
          configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
        }
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
