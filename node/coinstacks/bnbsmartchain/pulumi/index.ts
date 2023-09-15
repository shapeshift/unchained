import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, CoinServiceArgs, getConfig } from '../../../../pulumi/src'
import { defaultBlockbookServiceArgs } from '../../../packages/blockbook/src/constants'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'bnbsmartchain'
  const sampleEnv = readFileSync('../sample.env')
  const { kubeconfig, config, namespace } = await getConfig()

  const coinServiceArgs = config.statefulService?.services?.map((service): CoinServiceArgs => {
    switch (service.name) {
      case 'daemon':
        return {
          ...service,
          ports: {
            'daemon-rpc': { port: 8545 },
            'daemon-ws': { port: 8546, pathPrefix: '/websocket', stripPathPrefix: true },
          },
          env: {
            SNAPSHOT: 'https://pub-c0627345c16f47ab858c9469133073a8.r2.dev/geth-20230719.tar.lz4',
          },
          configMapData: { 'evm.sh': readFileSync('../../../scripts/evm.sh').toString() },
          volumeMounts: [{ name: 'config-map', mountPath: '/evm.sh', subPath: 'evm.sh' }],
          startupProbe: { periodSeconds: 30, failureThreshold: 60, timeoutSeconds: 10 },
          livenessProbe: { periodSeconds: 30, failureThreshold: 5, timeoutSeconds: 10 },
          readinessProbe: { periodSeconds: 30, failureThreshold: 10 },
        }
      case 'indexer':
        return {
          ...service,
          ...defaultBlockbookServiceArgs,
          command: defaultBlockbookServiceArgs.command,
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
