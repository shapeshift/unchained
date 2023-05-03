import { Config, deployApi, JointCoinServiceInput, Outputs, SecretData, ServiceConfig, ServiceArgs, Snapper } from '.'
import { getConfig } from './config'
import { parse } from 'dotenv'
import { createService, deployStatefulService } from './statefulService'
import * as k8s from '@pulumi/kubernetes'
import { CoinstackType } from './hash'

export const deployCoinstack = async (
  appName: string,
  coinstack: string,
  serviceArgs: ServiceArgs[],
  sampleEnv: Buffer,
  coinstackType: CoinstackType,
  volumes?: Array<k8s.types.input.core.v1.Volume>
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

  const coinServices = aggregateCoinServiceInput(config.statefulService?.services || [], serviceArgs)
    .map((cs) => enrichWithPulumiConfig(cs, namespace, coinstack, config))
    .map((cs) => createService(cs, assetName, snapshots))
  await deployStatefulService(appName, assetName, provider, namespace, config, coinServices, volumes)
  return {}
}

const enrichWithPulumiConfig = (
  csi: JointCoinServiceInput,
  namespace: string,
  coinstack: string,
  config: Config
): JointCoinServiceInput => {
  // TODO how to solve this elegantly so that we know what to apply to which service?

  if (csi.coinServiceName == 'daemon' && coinstack == 'thorchain') {
    csi.env = {
      ...csi.env,
      CHAIN_ID: `${coinstack}-${config.network}-v1`,
      NET: config.network,
    }
  }

  if (csi.coinServiceName == 'daemon' && coinstack == 'ethereum') {
    csi.env = {
      ...csi.env,
      NETWORK: config.network,
    }
  }

  if (csi.coinServiceName == 'daemon' && coinstack == 'bnbsmartchain') {
    csi.env = {
      ...csi.env,
      SNAPSHOT: 'https://pub-c0627345c16f47ab858c9469133073a8.r2.dev/geth-20230409.tar.lz4',
    }
  }

  if (csi.coinServiceName == 'daemon' && coinstack == 'dogecoin') {
    csi.env = {
      ...csi.env,
      NETWORK: config.network,
    }
  }

  if (csi.coinServiceName == 'daemon' && coinstack == 'bitcoin') {
    csi.env = {
      ...csi.env,
      NETWORK: config.network,
    }
  }

  if (csi.coinServiceName == 'daemon' && coinstack == 'bitcoincash') {
    csi.env = {
      ...csi.env,
      NETWORK: config.network,
    }
  }

  if (csi.coinServiceName == 'heimdall' && coinstack == 'polygon') {
    csi.env = {
      ...csi.env,
      ETH_RPC_URL: `http://ethereum-svc.${namespace}.svc.cluster.local:8332`,
    }
  }

  if (csi.coinServiceName == 'dtl' && coinstack == 'optimism') {
    csi.env = {
      ...csi.env,
      L1_RPC_ENDPOINT: `http://ethereum-svc.${namespace}.svc.cluster.local:8332`,
    }
  }

  return csi
}

// Join the config set in the Pulumi config with the typescript input from the coinstack
const aggregateCoinServiceInput = (
  services: ServiceConfig[],
  coinServiceInput: ServiceArgs[]
): JointCoinServiceInput[] => {
  return services.reduce<JointCoinServiceInput[]>((acc, configInput) => {
    const serviceInput = coinServiceInput.find((svc) => svc.coinServiceName === configInput.name)
    if (serviceInput) {
      acc.push({ ...configInput, ...serviceInput })
    }
    return acc
  }, [])
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
