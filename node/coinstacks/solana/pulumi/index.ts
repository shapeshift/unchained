import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, getConfig } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'solana'
  const sampleEnv = readFileSync('../sample.env')
  const { kubeconfig, config, namespace } = await getConfig()

  return deployCoinstack({
    appName,
    coinstack,
    coinstackType: 'node',
    config,
    kubeconfig,
    namespace,
    sampleEnv,
  })
}
