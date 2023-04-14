import { parse } from 'dotenv'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'
import { createService, deployApi, deployStatefulService, getConfig, Service, Snapper } from '../../../../pulumi'
import { api } from '../../../pulumi'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'optimism'

  const { kubeconfig, config, namespace } = await getConfig()

  const assetName = config.network !== 'mainnet' ? `${coinstack}-${config.network}` : coinstack
  const outputs: Outputs = {}
  const provider = new k8s.Provider('kube-provider', { kubeconfig })
  const snapshots = await new Snapper({ assetName, kubeconfig, namespace }).getSnapshots()

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

  new k8s.core.v1.Secret(assetName, { metadata: { name: assetName, namespace }, stringData }, { provider })

  const baseImageName = 'shapeshiftdao/unchained-base:latest'

  await deployApi({
    appName,
    assetName,
    coinstack,
    baseImageName,
    buildAndPushImageArgs: { context: '../api' },
    config,
    container: { command: ['node', `dist/${coinstack}/api/src/app.js`] },
    getHash: api.getHash,
    namespace,
    provider,
    secretEnvs: api.secretEnvs,
  })

  if (config.statefulService) {
    const services = config.statefulService.services.reduce<Record<string, Service>>((prev, service) => {
      if (service.name === 'daemon') {
        prev[service.name] = createService({
          assetName,
          config: service,
          ports: {
            'daemon-rpc': { port: 8545 },
            'daemon-ws': { port: 8546, pathPrefix: '/websocket', stripPathPrefix: true },
          },
          readinessProbe: { failureThreshold: 5 },
          snapshots,
        })
      }

      if (service.name === 'dtl') {
        prev[service.name] = createService({
          assetName,
          config: service,
          env: { L1_RPC_ENDPOINT: `http://ethereum-svc.${namespace}.svc.cluster.local:8332` },
          ports: { http: { port: 7878 } },
          snapshots,
        })
      }

      if (service.name === 'indexer') {
        prev[service.name] = createService({
          assetName,
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
          snapshots,
        })
      }

      return prev
    }, {})

    await deployStatefulService(appName, assetName, provider, namespace, config, services)
  }

  return outputs
}
