import { deployApi, JointCoinServiceInput, Outputs, SecretData, ServiceConfig, ServiceInput, Snapper } from '.'
import { getConfig } from './config'
import { parse } from 'dotenv'
import { createService, deployStatefulService } from './statefulService'
import * as k8s from '@pulumi/kubernetes'
import { CoinstackType } from './hash'

export const deployCoinstack = async (
  appName: string,
  coinstack: string,
  serviceInput: ServiceInput[],
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

  const coinServices = aggregateCoinServiceInput(config.statefulService?.services || [], serviceInput).map((cs) =>
    createService(cs, assetName, snapshots)
  )
  await deployStatefulService(appName, assetName, provider, namespace, config, coinServices)

  return {}
}

// Join the config set in the Pulumi config with the typescript input from the coinstack
const aggregateCoinServiceInput = (
  services: ServiceConfig[],
  coinServiceInput: ServiceInput[]
): JointCoinServiceInput[] => {
  return (
    services.reduce<JointCoinServiceInput[]>((acc, itemA) => {
      const matchingItemB = coinServiceInput.find((itemB) => itemB.coinServiceName === itemA.name)
      if (matchingItemB) {
        acc.push({ ...itemA, ...matchingItemB })
      }
      return acc
    }, []) || []
  )
}

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
