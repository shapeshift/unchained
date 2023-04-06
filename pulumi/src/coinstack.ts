import { deployApi, ServiceConfig, Snapper, VolumeSnapshot } from '.'
import { getConfig } from './config'
import { parse } from 'dotenv'
import { createService, deployStatefulService } from './statefulService'
import * as k8s from '@pulumi/kubernetes'
import * as pulumi from '@pulumi/pulumi'
import { CoinstackType } from './hash'

interface Port {
  port: number
  ingressRoute?: boolean
  pathPrefix?: string
  stripPathPrefix?: boolean
}

export interface ServiceInput {
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

interface CoinService extends ServiceInput, ServiceConfig {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

export const deployCoinstack = async (
  appName: string,
  coinstack: string,
  coinServiceInput: ServiceInput[],
  sampleEnv: Buffer,
  coinstackType: CoinstackType
): Promise<Outputs> => {
  const { kubeconfig, config, namespace } = await getConfig()

  const assetName = config.network !== 'mainnet' ? `${config.assetName}-${config.network}` : config.assetName
  const provider = new k8s.Provider('kube-provider', { kubeconfig })
  const secretData = getSecretData(sampleEnv)

  new k8s.core.v1.Secret(assetName, { metadata: { name: assetName, namespace }, stringData: secretData }, { provider })

  const baseImageName = 'shapeshiftdao/unchained-base:latest'
  const snapshots = await new Snapper({ assetName, kubeconfig, namespace }).getSnapshots()

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

  const coinServices =
    config.statefulService?.services.reduce<CoinService[]>((acc, itemA) => {
      const matchingItemB = coinServiceInput.find((itemB) => itemB.coinServiceName === itemA.name)
      if (matchingItemB) {
        acc.push({ ...itemA, ...matchingItemB })
      }
      return acc
    }, []) || []

  const services = coinServices.map((cs) =>
    createService({
      command: cs.command,
      ports: cs.ports,
      assetName: assetName,
      args: cs.args,
      config: cs,
      snapshots: snapshots,
      coinServiceName: cs.coinServiceName,
    })
  )

  await deployStatefulService(appName, assetName, provider, namespace, config, services)

  return {}
}

type SecretData = pulumi.Input<{
  [key: string]: pulumi.Input<string>
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
  return stringData
}
