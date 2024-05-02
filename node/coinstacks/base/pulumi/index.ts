import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, CoinServiceArgs, getConfig } from '../../../../pulumi/src'
import { defaultBlockbookServiceArgs } from '../../../packages/blockbook/src/constants'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'base'
  const sampleEnv = readFileSync('../sample.env')
  const { kubeconfig, config, namespace } = await getConfig()

  const coinServiceArgs = config.statefulService?.services?.map((service): CoinServiceArgs => {
    switch (service.name) {
      case 'daemon':
        return {
          ...service,
          env: { SNAPSHOT: 'https://mainnet-full-snapshots.base.org/base-mainnet-full-1714543184.tar.gz' },
          ports: {
            'daemon-rpc': { port: 8545 },
            'daemon-ws': { port: 8546, pathPrefix: '/websocket', stripPathPrefix: true },
            'daemon-auth': { port: 8551, ingressRoute: false },
          },
          configMapData: {
            'jwt.hex': readFileSync('../daemon/jwt.hex').toString(),
            'evm.sh': readFileSync('../../../scripts/evm.sh').toString(),
          },
          volumeMounts: [
            { name: 'config-map', mountPath: '/jwt.hex', subPath: 'jwt.hex' },
            { name: 'config-map', mountPath: '/evm.sh', subPath: 'evm.sh' },
          ],
          startupProbe: { periodSeconds: 30, failureThreshold: 60, timeoutSeconds: 10 },
          livenessProbe: { periodSeconds: 30, failureThreshold: 10, timeoutSeconds: 10 },
          readinessProbe: { periodSeconds: 30, failureThreshold: 10, timeoutSeconds: 10 },
        }

      case 'op-node':
        return {
          ...service,
          env: {
            L1_RPC_ENDPOINT: `http://ethereum-svc.unchained.svc.cluster.local:8545`,
            L1_BEACON_ENDPOINT: `http://ethereum-svc.unchained.svc.cluster.local:3500`,
          },
          ports: { 'op-node-rpc': { port: 9545, ingressRoute: false } },
          configMapData: { 'evm.sh': readFileSync('../../../scripts/evm.sh').toString() },
          volumeMounts: [
            { name: 'config-map', mountPath: '/jwt.hex', subPath: 'jwt.hex' },
            { name: 'config-map', mountPath: '/evm.sh', subPath: 'evm.sh' },
          ],
          startupProbe: { periodSeconds: 30, failureThreshold: 60, timeoutSeconds: 10 },
          livenessProbe: { periodSeconds: 30, failureThreshold: 10, timeoutSeconds: 10 },
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
