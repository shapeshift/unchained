import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { CoinstackType } from '../../../../pulumi/src/hash'
import { Outputs, ServiceInput } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'osmosis'
  const sampleEnv = readFileSync('../sample.env')
  const coinServiceInput: ServiceInput[] = [
    {
      coinServiceName: 'daemon',
      ports: {
        'daemon-api': { port: 1317, pathPrefix: '/lcd', stripPathPrefix: true },
        'daemon-rpc': { port: 26657, pathPrefix: '/rpc', stripPathPrefix: true },
      },
    },
  ]

  return await deployCoinstack(appName, coinstack, coinServiceInput, sampleEnv, CoinstackType.GO)
}