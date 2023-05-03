import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, CoinServiceArgs, getConfig } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'cosmos'
  const sampleEnv = readFileSync('../../../cmd/cosmos/sample.env')
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
        }
      default:
        throw new Error('coinService not supported')
    }
  }) || []

  return await deployCoinstack(kubeconfig, config, namespace, appName, coinstack, coinServiceArgs, sampleEnv, 'go')
}