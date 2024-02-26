import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, CoinServiceArgs, getConfig } from '../../../../pulumi/src'
import { defaultBlockbookServiceArgs } from '../../../packages/blockbook/src/constants'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'ethereum'
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
            'daemon-auth': { port: 8551, ingressRoute: false },
            'daemon-beacon': { port: 3500, ingressRoute: false },
          },
          configMapData: {
            'jwt.hex': readFileSync('../daemon/jwt.hex').toString(),
            'evm.sh': readFileSync('../../../scripts/evm.sh').toString(),
          },
          volumeMounts: [
            { name: 'config-map', mountPath: '/jwt.hex', subPath: 'jwt.hex' },
            { name: 'config-map', mountPath: '/evm.sh', subPath: 'evm.sh' },
          ],
          env: {
            NETWORK: config.network,
          },
          startupProbe: { periodSeconds: 30, failureThreshold: 60, timeoutSeconds: 10 },
          livenessProbe: { periodSeconds: 30, failureThreshold: 5, timeoutSeconds: 10 },
          readinessProbe: { periodSeconds: 30, failureThreshold: 10, timeoutSeconds: 10 },
        }
      case 'daemon-beacon':
        return {
          ...service,
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
          useMonitorContainer: true,
          readinessProbe: { periodSeconds: 30, failureThreshold: 10 },
        }
      case 'indexer':
        return {
          ...service,
          ...defaultBlockbookServiceArgs,
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
