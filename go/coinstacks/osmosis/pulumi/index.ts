import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, CoinServiceArgs, getConfig } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'osmosis'
  const sampleEnv = readFileSync('../../../cmd/osmosis/sample.env')
  const { kubeconfig, config, namespace } = await getConfig()

  const coinServiceArgs = config.statefulService?.services?.map((service): CoinServiceArgs => {
    switch (service.name) {
      case 'daemon':
        return {
          ...service,
          dataDir: '/root',
          ports: {
            'daemon-api': { port: 1317, pathPrefix: '/lcd', stripPathPrefix: true },
            'daemon-rpc': { port: 26657, pathPrefix: '/rpc', stripPathPrefix: true },
          },
          configMapData: { 'tendermint.sh': readFileSync('../../../scripts/tendermint.sh').toString() },
          volumeMounts: [ { name: 'config-map', mountPath: '/tendermint.sh', subPath: 'tendermint.sh' } ],
          startupProbe: {
            httpGet: { path: '/status', port: 26657 },
            periodSeconds: 30,
            failureThreshold: 60,
            timeoutSeconds: 10,
          },
          livenessProbe: { periodSeconds: 30, failureThreshold: 5, timeoutSeconds: 10 },
          readinessProbe: { periodSeconds: 30, failureThreshold: 10, timeoutSeconds: 10 },
        }
      default:
        throw new Error(`no support for coin service: ${service.name}`)
    }
  })

  return deployCoinstack({
    appName,
    coinServiceArgs,
    coinstack,
    coinstackType: 'go',
    config,
    kubeconfig,
    namespace,
    sampleEnv,
  })
}
