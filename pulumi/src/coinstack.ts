import { CoinServiceArgs, Config, deployApi, Outputs, Snapper } from '.'
import { parse } from 'dotenv'
import { createCoinService, deployStatefulService } from './statefulService'
import * as k8s from '@pulumi/kubernetes'
import { CoinstackType } from './hash'

export const deployCoinstack = async (
  kubeconfig: string,
  config: Config,
  namespace: string,
  appName: string,
  coinstack: string,
  sampleEnv: Buffer,
  coinstackType: CoinstackType,
  volumes?: Array<k8s.types.input.core.v1.Volume>,
  coinServiceArgs?: CoinServiceArgs[]
): Promise<Outputs> => {
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
    coinServiceArgs?.map((coinServiceArg) => createCoinService(coinServiceArg, assetName, snapshots)) || []
  await deployStatefulService(appName, assetName, provider, namespace, config, coinServices, volumes)
  return {}
}

const getSecretData = (sampleEnv: Buffer): Record<string, string> => {
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
