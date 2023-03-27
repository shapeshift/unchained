import { parse } from 'dotenv'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'
import { deployApi, deployStatefulService, getConfig } from '../../../../pulumi'
import { api } from '../../../pulumi'
import { PvcResolver } from '../../../../pulumi/src/pvcResolver'
import { deployCoinServices } from './coinservice'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const name = 'unchained'

  const { kubeconfig, config, namespace } = await getConfig()
  const coinstack = config.name
  const asset = config.network !== 'mainnet' ? `${coinstack}-${config.network}` : coinstack

  const pvcResolver = new PvcResolver(kubeconfig, namespace)

  const outputs: Outputs = {}
  const provider = new k8s.Provider('kube-provider', { kubeconfig })

  const missingKeys: Array<string> = []
  const stringData = Object.keys(parse(readFileSync('../sample.env'))).reduce((prev, key) => {
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

  const baseImageName = 'shapeshiftdao/unchained-base:latest'

  await deployApi({
    app: name,
    asset,
    baseImageName,
    buildAndPushImageArgs: { context: '../api' },
    config,
    container: { command: ['node', `dist/avalanche/api/src/app.js`] },
    getHash: api.getHash,
    namespace,
    provider,
    secretEnvs: api.secretEnvs,
  })

  if (config.statefulService) {
    const coinServices = await deployCoinServices(config.statefulService, asset, pvcResolver)
    await deployStatefulService(name, asset, provider, namespace, config, coinServices)
  }

  return outputs
}
