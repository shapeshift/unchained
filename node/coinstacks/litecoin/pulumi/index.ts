import { parse } from 'dotenv'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'
import { CoinService, deployApi, deployStatefulService, getConfig, StatefulService } from '../../../../pulumi'
import { VolumeSnapshot, VolumeSnapshotClient } from '../../../../pulumi/src/volumeSnapshotClient'
import { createCoinService } from '../../../../pulumi/src/coinService'
import { api } from '../../../pulumi'
import { Service } from '@pulumi/kubernetes/core/v1'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const name = 'unchained'

  const { kubeconfig, config, namespace } = await getConfig()
  const coinstack = config.name

  const asset = config.network !== 'mainnet' ? `${coinstack}-${config.network}` : coinstack
  const outputs: Outputs = {}
  const provider = new k8s.Provider('kube-provider', { kubeconfig })
  const snapshots = await new VolumeSnapshotClient(kubeconfig, namespace).getVolumeSnapshots(asset)

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
    container: { command: ['node', `dist/${coinstack}/api/src/app.js`] },
    getHash: api.getHash,
    namespace,
    provider,
    secretEnvs: api.secretEnvs,
  })

  if (config.statefulService) {
    const services = config.statefulService.coinServices.map<Record<string, CoinService>>((prev, service) => {
      if (service.name === 'daemon') {
        prev[service.name] = createCoinService({
          asset,
          config: service,
          env: { NETWORK: config.network },
          ports: { 'daemon-rpc': { port: 8332 } },
          volumeSnapshots: snapshots,
          serviceName: service.name,
        })
      }

      if (service.name === 'indexer') {
        prev[service.name] = createCoinService({
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
          serviceName: service.name,
          ports: { public: { port: 8001 } },
          configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
          volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
          readinessProbe: { initialDelaySeconds: 20, periodSeconds: 5, failureThreshold: 12 },
          livenessProbe: { timeoutSeconds: 10, initialDelaySeconds: 60, periodSeconds: 15, failureThreshold: 4 },
          volumeSnapshots: snapshots,
        })
      }

      return prev
    }, {})

    await deployStatefulService(name, asset, provider, namespace, config, services)
  }

  return outputs
}

const deployCoinServices = async (
  statefulService: StatefulService,
  asset: string,
  volumeSnapshots: VolumeSnapshot[]
) => {
  return await Promise.all(
    statefulService.coinServices
      .map((coinService) => {
        if (service.name === 'daemon') {
          return createCoinService({
            asset,
            serviceName: coinService.name,
            config: service,
            env: { NETWORK: config.network },
            ports: { 'daemon-rpc': { port: 8332 } },
            snapshots,
          })
        }
        if (coinService.name === 'daemon') {
          return createCoinService({
            asset,
            config: coinService,
            serviceName: coinService.name,
            ports: { 'daemon-rpc': { port: 9650 } },
            configMapData: { 'c-chain-config.json': readFileSync('../daemon/config.json').toString() },
            volumeMounts: [
              { name: 'config-map', mountPath: '/configs/chains/C/config.json', subPath: 'c-chain-config.json' },
            ],
            volumeSnapshots,
          })
        }
        if (coinService.name === 'indexer') {
          return createCoinService({
            serviceName: coinService.name,
            asset,
            config: coinService,
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
            volumeSnapshots,
          })
        }
        return null
      })
      .filter((s): s is Promise<CoinService> => Boolean(s))
  )
}
