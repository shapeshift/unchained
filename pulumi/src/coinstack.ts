import { CoinServiceArgs, Config, deployApi, DeployApiArgs, Outputs } from '.'
import { createCoinService, deployStatefulService } from './statefulService'
import * as k8s from '@pulumi/kubernetes'
import { CoinstackType, getCoinstackHash } from './hash'
import { createSecret } from './secret'

export interface CoinstackArgs {
  appName: string
  coinServiceArgs?: CoinServiceArgs[]
  coinstack: string
  coinstackType: CoinstackType
  config: Config
  kubeconfig: string
  namespace: string
  sampleEnv: Buffer
  volumes?: Array<k8s.types.input.core.v1.Volume>
}

export const deployCoinstack = async (args: CoinstackArgs): Promise<Outputs> => {
  const { appName, config, kubeconfig, namespace, sampleEnv, volumes, coinServiceArgs, coinstackType, coinstack } = args

  const assetName = config.network !== 'mainnet' ? `${config.assetName}-${config.network}` : config.assetName
  const provider = new k8s.Provider('kube-provider', { kubeconfig })

  createSecret({ name: assetName, env: sampleEnv, namespace }, { provider })

  const docker: DeployApiArgs['docker'] = {
    baseImageName: 'shapeshiftdao/unchained-base:latest',
    tag: await getCoinstackHash(coinstack, coinstackType),
    ...(coinstackType === 'node'
      ? {
          context: '../api',
          command: ['node', `dist/${coinstack}/api/src/app.js`],
        }
      : {
          context: '../../../',
          dockerFile: '../../../build/Dockerfile',
          args: ['-swagger', 'swagger.json'],
        }),
  }

  await deployApi({ ...args, assetName, docker, provider })

  const coinServices = (coinServiceArgs ?? []).map((_args) => createCoinService(_args, assetName))

  await deployStatefulService(appName, assetName, provider, namespace, config, coinServices, volumes)

  return {}
}
