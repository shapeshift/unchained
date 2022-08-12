import { readFileSync } from 'fs'
import { Service, ServiceConfig } from '.'

export interface ServiceArgs {
  asset: string
  config: ServiceConfig
  ports: Record<string, number>
  env: Record<string, string>
  dataDir?: string
}

export function daemonService(args: ServiceArgs): Service {
  const name = `${args.asset}-daemon`
  const ports = Object.entries(args.ports).map(([name, port]) => ({ name, port }))
  const env = Object.entries(args.env).map(([name, value]) => ({ name, value }))

  const configMapData = {
    'init.sh': readFileSync('../daemon/init.sh').toString(),
    'daemon-readiness.sh': readFileSync('../daemon/readiness.sh').toString(),
  }

  const containers = [
    {
      name,
      image: args.config.image,
      command: ['/init.sh'],
      env,
      resources: {
        limits: {
          cpu: args.config.cpuLimit,
          memory: args.config.memoryLimit,
        },
        ...(args.config.cpuRequest && {
          requests: {
            cpu: args.config.cpuRequest,
          },
        }),
      },
      ports: ports.map(({ port: containerPort, name }) => ({ containerPort, name})),
      securityContext: { runAsUser: 0 },
      volumeMounts: [
        {
          name: 'data-daemon',
          mountPath: args.dataDir ?? '/data',
        },
        {
          name: 'config-map',
          mountPath: '/init.sh',
          subPath: 'init.sh',
        },
      ],
    },
    {
      name: `${name}-monitor`,
      image: 'shapeshiftdao/unchained-probe:1.0.0',
      readinessProbe: {
        exec: {
          command: ['/readiness.sh'],
        },
        initialDelaySeconds: 30,
        periodSeconds: 10,
      },
      volumeMounts: [
        {
          name: 'config-map',
          mountPath: '/readiness.sh',
          subPath: 'daemon-readiness.sh',
        },
      ],
    },
  ]

  const volumeClaimTemplates = [
    {
      metadata: {
        name: 'data-daemon',
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        storageClassName: 'gp2',
        resources: {
          requests: {
            storage: args.config.storageSize,
          },
        },
      },
    },
  ]

  return {
    configMapData,
    containers,
    ports,
    volumeClaimTemplates,
  }
}
