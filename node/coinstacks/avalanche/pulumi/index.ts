import { readFileSync } from 'fs'
import { deployCoinstack } from '../../../../pulumi/src/coinstack'
import { Outputs, ServiceArgs, getConfig } from '../../../../pulumi/src'

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const appName = 'unchained'
  const coinstack = 'avalanche'
  const sampleEnv = readFileSync('../sample.env')
  const { kubeconfig, config, namespace } = await getConfig()
  const coinServiceInput: ServiceArgs[] = [
    {
      coinServiceName: 'daemon',
      ports: { 'daemon-rpc': { port: 9650 } },
      configMapData: { 'c-chain-config.json': readFileSync('../daemon/config.json').toString() },
      volumeMounts: [
        { name: 'config-map', mountPath: '/configs/chains/C/config.json', subPath: 'c-chain-config.json' },
      ],
    },
    {
      coinServiceName: 'indexer',
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
    },
  ]

  return await deployCoinstack(kubeconfig, config, namespace, appName, coinstack, coinServiceInput, sampleEnv, 'node')
}
