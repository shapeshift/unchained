import * as k8s from '@pulumi/kubernetes'
import { readFileSync } from 'fs'
import { CoinService, CoinServiceConfig, StatefulService } from '../../../../pulumi/src'
import { PvcResolver } from '../../../../pulumi/src/pvcResolver'

export const deployCoinServices = async (statefulService: StatefulService, asset: string, pvcResolver: PvcResolver) => {
  return await Promise.all(
    statefulService.coinServices
      .map((coinService) => {
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
            pvcResolver,
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
            pvcResolver,
          })
        }
        return null
      })
      .filter((s): s is Promise<CoinService> => Boolean(s))
  )
}

interface Port {
  port: number
  ingressRoute?: boolean
  pathPrefix?: string
  stripPathPrefix?: boolean
}

export interface CoinServiceArgs {
  serviceName: string
  asset: string
  config: CoinServiceConfig
  ports: Record<string, Port>
  command?: Array<string>
  args?: Array<string>
  env?: Record<string, string>
  dataDir?: string
  configMapData?: Record<string, string>
  volumeMounts?: Array<k8s.types.input.core.v1.VolumeMount>
  readinessProbe?: k8s.types.input.core.v1.Probe
  livenessProbe?: k8s.types.input.core.v1.Probe
  pvcResolver: PvcResolver
}

async function createCoinService(args: CoinServiceArgs): Promise<CoinService> {
  const name = `${args.asset}-${args.config.name}`
  const ports = Object.entries(args.ports).map(([name, port]) => ({ name, ...port }))
  const env = Object.entries(args.env ?? []).map(([name, value]) => ({ name, value }))

  const init = (() => {
    try {
      return readFileSync(`../${args.config.name}/init.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const liveness = (() => {
    try {
      return readFileSync(`../${args.config.name}/liveness.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const readiness = (() => {
    try {
      return readFileSync(`../${args.config.name}/readiness.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const configMapData = {
    ...(Boolean(init) && { [`${args.config.name}-init.sh`]: init }),
    ...(Boolean(liveness) && { [`${args.config.name}-liveness.sh`]: liveness }),
    ...(Boolean(readiness) && { [`${args.config.name}-readiness.sh`]: readiness }),
    ...(args.configMapData ?? {}),
  }

  const containers: Array<k8s.types.input.core.v1.Container> = []

  const serviceContainer: k8s.types.input.core.v1.Container = {
    name,
    image: args.config.image,
    command: init && !args.command ? ['/init.sh'] : args.command,
    args: args.args,
    env,
    resources: {
      limits: {
        ...(args.config.cpuLimit && { cpu: args.config.cpuLimit }),
        ...(args.config.memoryLimit && { memory: args.config.memoryLimit }),
      },
      requests: {
        ...(args.config.cpuRequest && { cpu: args.config.cpuRequest }),
        ...(args.config.memoryRequest && { memory: args.config.memoryRequest }),
      },
    },
    ports: ports.map(({ port: containerPort, name }) => ({ containerPort, name })),
    securityContext: { runAsUser: 0 },
    volumeMounts: [
      {
        name: `data-${args.config.name}`,
        mountPath: args.dataDir ?? '/data',
      },
      ...(init
        ? [
            {
              name: 'config-map',
              mountPath: '/init.sh',
              subPath: `${args.config.name}-init.sh`,
            },
          ]
        : []),
      ...(args.volumeMounts ?? []),
    ],
  }

  containers.push(serviceContainer)

  if (readiness || liveness) {
    const monitorContainer: k8s.types.input.core.v1.Container = {
      name: `${name}-monitor`,
      image: 'shapeshiftdao/unchained-probe:1.0.0',
      ...(readiness && {
        readinessProbe: {
          exec: {
            command: ['/readiness.sh'],
          },
          initialDelaySeconds: 30,
          periodSeconds: 10,
          ...args.readinessProbe,
        },
      }),
      ...(liveness && {
        livenessProbe: {
          exec: {
            command: ['/liveness.sh'],
          },
          initialDelaySeconds: 30,
          periodSeconds: 10,
          ...args.livenessProbe,
        },
      }),
      volumeMounts: [
        ...(readiness
          ? [
              {
                name: 'config-map',
                mountPath: '/readiness.sh',
                subPath: `${args.config.name}-readiness.sh`,
              },
            ]
          : []),
        ...(liveness
          ? [
              {
                name: 'config-map',
                mountPath: '/liveness.sh',
                subPath: `${args.config.name}-liveness.sh`,
              },
            ]
          : []),
      ],
    }

    containers.push(monitorContainer)
  }

  const volumeClaimTemplates = await args.pvcResolver.getVolumeClaimTemplates(
    args.asset,
    args.serviceName,
    args.config.storageSize
  )

  return {
    serviceName: args.serviceName,
    configMapData,
    containers,
    ports,
    volumeClaimTemplates,
  }
}
