import { deployApi, Service, ServiceConfig } from "."
import { getConfig } from "./config"
import { parse } from 'dotenv'
import { createService, deployStatefulService } from "./statefulService"
import * as k8s from '@pulumi/kubernetes'
import * as pulumi from "@pulumi/pulumi";
import { CoinstackType } from "./hash"

interface Port {
  port: number
  ingressRoute?: boolean
  pathPrefix?: string
  stripPathPrefix?: boolean
}

export interface ServiceInput{
  coinServiceName: string
  ports: Record<string, Port>
  command?: Array<string>
  args?: Array<string>
  env?: Record<string, string>
  dataDir?: string
  configMapData?: Record<string, string>
  volumeMounts?: Array<k8s.types.input.core.v1.VolumeMount>
  readinessProbe?: k8s.types.input.core.v1.Probe
  livenessProbe?: k8s.types.input.core.v1.Probe 
}

interface CoinService extends ServiceInput, ServiceConfig {
  
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

export const deployCoinstack = async (appName: string, coinstack: string, coinServiceInput: ServiceInput[], sampleEnv: Buffer, coinstackType: CoinstackType) => {

  const { kubeconfig, config, namespace } = await getConfig()

  const assetName = config.network !== 'mainnet' ? `${config.assetName}-${config.network}` : config.assetName
  const outputs: Outputs = {}
  const provider = new k8s.Provider('kube-provider', { kubeconfig })
  const secretData = getSecretData(sampleEnv)

  new k8s.core.v1.Secret(assetName, { metadata: { name: assetName, namespace }, stringData: secretData }, { provider })

  const baseImageName = 'shapeshiftdao/unchained-base:latest'

  await deployApi({
    appName,
    assetName,
    coinstack,
    coinstackType,
    sampleEnv,
    baseImageName,
    config,
    namespace,
    provider,
  })
  

  const coinServices = config.statefulService?.services.reduce<CoinService[]>((acc, itemA) => {
    const matchingItemB = coinServiceInput.find(itemB => itemB.coinServiceName === itemA.name);
    if (matchingItemB) {
      acc.push({...itemA, ...matchingItemB});
    }
    return acc;
  }, []) || [];

  coinServices.forEach(cs => createService({
    command: cs.command,
    ports: cs.ports,
    assetName: cs.assetName,
  })

  if (config.statefulService) {



    const services = config.statefulService.services.reduce<Record<string, Service>>((prev, service) => {
      if (service.name === 'daemon') {
        prev[service.name] = createService({
          asset,
          config: service,
          env: { NETWORK: config.network },
          ports: { 'daemon-rpc': { port: 8332 } },
        })
      }

      if (service.name === 'indexer') {
        prev[service.name] = createService({
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
        })
      }

      return prev
    }, {})

    await deployStatefulService(name, asset, provider, namespace, config, services)
  }

  return outputs
}

type SecretData = pulumi.Input<{
  [key: string]: pulumi.Input<string>;
}>

const getSecretData = (sampleEnv: Buffer): SecretData => {
  const missingKeys: Array<string> = []
  const stringData = Object.keys(parse(sampleEnv)).reduce((prev, key) => {
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
  return stringData;
}