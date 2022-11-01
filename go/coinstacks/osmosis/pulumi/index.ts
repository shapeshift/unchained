import { parse } from 'dotenv'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'
import { deployApi, getConfig } from '../../../../pulumi'
import { api } from '../../../pulumi'

type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const name = 'unchained'
  const coinstack = 'osmosis'

  const { kubeconfig, config, namespace } = await getConfig(coinstack)

  const asset = config.network !== 'mainnet' ? `${coinstack}-${config.network}` : coinstack
  const outputs: Outputs = {}
  const provider = new k8s.Provider('kube-provider', { kubeconfig })

  const missingKeys: Array<string> = []
  const stringData = Object.keys(parse(readFileSync(`../../../cmd/${coinstack}/sample.env`))).reduce((prev, key) => {
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

  await deployApi({
    app: name,
    asset,
    buildAndPushImageArgs: { context: '../../../../go', dockerFile: '../../../build/Dockerfile' },
    config,
    container: { args: ['-swagger', 'swagger.json'] },
    getHash: api.getHash,
    namespace,
    provider,
    secretEnvs: api.secretEnvs,
  })

  return outputs
}
