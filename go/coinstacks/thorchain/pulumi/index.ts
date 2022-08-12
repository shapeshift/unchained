import { parse } from 'dotenv'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'
import { daemonService, deployStatefulService, getConfig, Service } from '../../../pulumi/src'

type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const { kubeconfig, config, namespace } = await getConfig('thorchain')

  const name = 'unchained'
  const asset = config.network !== 'mainnet' ? `thorchain-${config.network}` : 'thorchain'
  const outputs: Outputs = {}

  const provider = new k8s.Provider('kube-provider', { kubeconfig })

  const missingKeys: Array<string> = []
  const stringData = Object.keys(parse(readFileSync('../../../cmd/thorchain/sample.env'))).reduce((prev, key) => {
    const value = process.env[key]

    if (!value) {
      missingKeys.push(key)
      return prev
    }

    return { ...prev, [key]: value }
  }, {})

  if (missingKeys.length) {
    throw new Error(`Missing the following required environment variables: ${missingKeys.join(', ')}`)
  }

  new k8s.core.v1.Secret(asset, { metadata: { name: asset, namespace }, stringData }, { provider })

  //await deployApi(name, asset, provider, namespace, config)

  if (config.statefulService) {
    const services: Record<string, Service> = {}

    if (config.statefulService.daemon) {
      services.daemon = daemonService({
        asset,
        config: config.statefulService.daemon,
        dataDir: '/root', // default home path for thornode docker image
        env: {'CHAIN_ID': `thorchain-${config.network}-v1`, 'NET': config.network},
        ports: {'daemon-api': 1317, 'daemon-rpc': 27147}
      })
    }

    await deployStatefulService(name, asset, provider, namespace, config, services)
  }

  return outputs
}
