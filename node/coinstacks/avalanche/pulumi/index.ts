import { config as getEnv, parse } from 'dotenv'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import * as k8s from '@pulumi/kubernetes'
import { deployApi, getConfig, Service, deployStatefulService, createService } from '../../../../pulumi/src'
import * as api from '../../../pulumi/src/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const name = 'unchained'
  const coinstack = 'avalanche'
  const { kubeconfig, config, namespace } = await getConfig(coinstack)
  const asset = config.network !== 'mainnet' ? `avalanche-${config.network}` : 'avalanche'
  const provider = new k8s.Provider('kube-provider', { kubeconfig })
  const outputs: Outputs = {}

  if (existsSync('../.env')) getEnv({ path: join(__dirname, '../.env') })

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

  await deployApi({
    app: name,
    asset,
    buildAndPushImageArgs: {
      context: `../../${coinstack}/api`,
    },
    config,
    container: {
      command: ['node', `dist/${coinstack}/api/src/app.js`],
    },
    getHash: api.getHash,
    namespace,
    provider,
    secretEnvs: api.secretEnvs(coinstack, asset),
  })

  if (config.statefulService) {
    const services = config.statefulService.services.reduce<Record<string, Service>>((prev, service) => {
      if (service.name === 'indexer') {
        prev.indexer = createService({
          asset,
          config: service,
          dataDir: '/data',
          name: 'indexer',
          ports: { public: { port: 8001 } },
          command: [
            '/bin/blockbook',
            '-blockchaincfg=/config/config.json',
            '-datadir=/data',
            '-sync',
            '-public=:8001',
            '-enablesubnewtx',
            '-logtostderr',
            '-debug',
          ],
          configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
          volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
        })
      }

      return prev
    }, {})

    await deployStatefulService(name, asset, provider, namespace, config, services)
  }

  return outputs
}
