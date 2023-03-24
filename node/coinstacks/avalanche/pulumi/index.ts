import { parse } from 'dotenv'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'
import { deployApi, deployStatefulService, getConfig, Service } from '../../../../pulumi'
import { api } from '../../../pulumi'
import { PvcResolver } from '../../../../pulumi/src/pvcResolver'
import { createService } from '../../../../pulumi/src/serviceResolver'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

// 1. Validation the configuration
// 2. Deploy the API
// 3. Deploy stateful service

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
    // deploy one by one instead of reduce -> deploy?
    // const services =

    config.statefulService.services.map(async (service) => {
      if (service.name === 'daemon') {
        return [
          service.name,
          await createService({
            asset,
            config: service,
            ports: { 'daemon-rpc': { port: 9650 } },
            configMapData: { 'c-chain-config.json': readFileSync('../daemon/config.json').toString() },
            volumeMounts: [
              { name: 'config-map', mountPath: '/configs/chains/C/config.json', subPath: 'c-chain-config.json' },
            ],
            pvcResolver,
          }),
        ]
      }

      if (service.name === 'daemon') {
        return [
          service.name,
          await createService({
            asset,
            config: service,
            command: [
              '/bin/blockbook',
              '-blockchaincfg=/config.json',
              '-datadir=/data',
              '-sync',
              '-public=:8001',
              '-enablesubnewtx',
              '-logtostderr',
              '-debug',
            ],
            ports: { public: { port: 8001 } },
            configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
            volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
            readinessProbe: { initialDelaySeconds: 20, periodSeconds: 5, failureThreshold: 12 },
            livenessProbe: { timeoutSeconds: 10, initialDelaySeconds: 60, periodSeconds: 15, failureThreshold: 4 },
            pvcResolver,
          }),
        ]
      }
      return null
    })

    await deployStatefulService(name, asset, provider, namespace, config, services)
  }

  return outputs
}
