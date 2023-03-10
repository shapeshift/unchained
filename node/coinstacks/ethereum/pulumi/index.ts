import * as k8s from '@pulumi/kubernetes'
import { createService, deployStatefulService, getConfig, Service } from '../../../../pulumi'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const name = 'unchained'
  const coinstack = 'ethereum'

  const { kubeconfig, config, namespace } = await getConfig(coinstack)

  const asset = config.network !== 'mainnet' ? `${coinstack}-${config.network}` : coinstack
  const outputs: Outputs = {}
  const provider = new k8s.Provider('kube-provider', { kubeconfig })

  // const missingKeys: Array<string> = []
  // const stringData = Object.keys(parse(readFileSync('../sample.env'))).reduce((prev, key) => {
  //   const value = process.env[key]

  //   if (!value) {
  //     missingKeys.push(key)
  //     return prev
  //   }

  //   return { ...prev, [key]: value }
  // }, {})

  // if (missingKeys.length) {
  //   throw new Error(`Missing the following required environment variables: ${missingKeys.join(', ')}`)
  // }

  // new k8s.core.v1.Secret(asset, { metadata: { name: asset, namespace }, stringData }, { provider })

  // await deployApi({
  //   app: name,
  //   asset,
  //   baseImageName,
  //   buildAndPushImageArgs: { context: '../api' },
  //   config,
  //   container: { command: ['node', `dist/${coinstack}/api/src/app.js`] },
  //   getHash: api.getHash,
  //   namespace,
  //   provider,
  //   secretEnvs: api.secretEnvs,
  // })

  if (config.statefulService) {
    const services = config.statefulService.services.reduce<Record<string, Service>>((prev, service) => {
      prev[service.name] = createService({
        asset,
        config: service,
        command: ['/bin/sh'],
        args: ['-c', 'while true; do echo $(date -u) >> /data/out.txt; sleep 5; done'],
        ports: {},
        // volumeMounts: [{ name: 'config-map', subPath: 'out.txt' }],
      })
      return prev
    }, {})

    await deployStatefulService(name, asset, provider, namespace, config, services)
  }

  return outputs
}
