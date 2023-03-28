import * as k8s from '@pulumi/kubernetes'
import { readFileSync } from 'fs'
import { Config, Service, ServiceConfig } from '.'
import { deployReaperCron } from './reaperCron'

interface Port {
  port: number
  ingressRoute?: boolean
  pathPrefix?: string
  stripPathPrefix?: boolean
}

export interface ServiceArgs {
  assetName: string
  config: ServiceConfig
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

export function createService(args: ServiceArgs): Service {
  const name = `${args.assetName}-${args.config.name}`
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

  const volumeClaimTemplates = [
    {
      metadata: {
        name: `data-${args.config.name}`,
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        storageClassName: 'ebs-csi-gp2',
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

export async function deployStatefulService(
  app: string,
  asset: string,
  provider: k8s.Provider,
  namespace: string,
  config: Pick<Config, 'rootDomainName' | 'environment' | 'statefulService'>,
  services: Record<string, Service>,
  volumes?: Array<k8s.types.input.core.v1.Volume>
): Promise<void> {
  if (!config.statefulService) return
  if (config.statefulService.replicas <= 0) return
  if (!Object.keys(services).length) return

  const labels = { app, asset, tier: 'statefulservice' }

  const ports = Object.values(services).reduce<Array<k8s.types.input.core.v1.ServicePort>>(
    (prev, { ports }) => [...prev, ...ports.map(({ name, port }) => ({ name, port }))],
    []
  )

  const configMapData = Object.values(services).reduce<Record<string, string>>(
    (prev, { configMapData }) => ({ ...prev, ...configMapData }),
    {}
  )

  const containers = Object.values(services).reduce<Array<k8s.types.input.core.v1.Container>>(
    (prev, { containers }) => prev.concat(...containers),
    []
  )

  const volumeClaimTemplates = Object.values(services).reduce<Array<k8s.types.input.core.v1.PersistentVolumeClaim>>(
    (prev, { volumeClaimTemplates }) => prev.concat(...volumeClaimTemplates),
    []
  )

  const svc = new k8s.core.v1.Service(
    `${asset}-svc`,
    {
      metadata: {
        name: `${asset}-svc`,
        namespace: namespace,
        labels: labels,
      },
      spec: {
        ports: ports,
        selector: labels,
        type: 'ClusterIP',
      },
    },
    { provider, deleteBeforeReplace: true }
  )

  const configMap = new k8s.core.v1.ConfigMap(
    `${asset}-cm`,
    {
      metadata: {
        namespace: namespace,
        labels: labels,
      },
      data: configMapData,
    },
    { provider }
  )

  const podSpec: k8s.types.input.core.v1.PodTemplateSpec = {
    metadata: {
      namespace: namespace,
      labels: labels,
    },
    spec: {
      containers: containers,
      volumes: [
        {
          name: 'config-map',
          configMap: {
            name: configMap.metadata.name,
            defaultMode: 0o755,
          },
        },
        ...(volumes ?? []),
      ],
      terminationGracePeriodSeconds: 120,
    },
  }

  new k8s.apps.v1.StatefulSet(
    `${asset}-sts`,
    {
      metadata: {
        name: `${asset}-sts`,
        namespace: namespace,
        annotations: { 'pulumi.com/skipAwait': 'true' },
      },
      spec: {
        selector: { matchLabels: labels },
        serviceName: `${asset}-svc`,
        replicas: config.statefulService.replicas,
        podManagementPolicy: 'Parallel',
        updateStrategy: {
          type: 'RollingUpdate',
        },
        template: podSpec,
        volumeClaimTemplates: volumeClaimTemplates,
      },
    },
    { provider }
  )

  if (config.rootDomainName) {
    const domain = (service: string) => {
      const baseDomain = `${service}.${asset}.${config.rootDomainName}`
      return config.environment ? `${config.environment}.${baseDomain}` : baseDomain
    }

    const secretName = `${asset}-cert-secret`

    new k8s.apiextensions.CustomResource(
      `${asset}-cert`,
      {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Certificate',
        metadata: {
          namespace: namespace,
          labels: labels,
        },
        spec: {
          secretName: secretName,
          duration: '2160h',
          renewBefore: '360h',
          isCA: false,
          privateKey: {
            algorithm: 'RSA',
            encoding: 'PKCS1',
            size: 2048,
          },
          dnsNames: Object.keys(services).map((service) => domain(service)),
          issuerRef: {
            name: 'lets-encrypt',
            kind: 'ClusterIssuer',
            group: 'cert-manager.io',
          },
        },
      },
      { provider }
    )

    const additionalRootDomainName = process.env.ADDITIONAL_ROOT_DOMAIN_NAME

    const match = (service: string, prefix?: string) => {
      const pathPrefixMatch = prefix ? ` && PathPrefix(\`${prefix}\`)` : ''
      const hostMatch = `(Host(\`${domain(`${service}`)}\`)${pathPrefixMatch})`
      const additionalHostMatch = `(Host(\`${
        config.environment ? `${config.environment}-${service}` : service
      }.${asset}.${additionalRootDomainName}\`)${pathPrefixMatch})`
      return additionalRootDomainName ? `${hostMatch} || ${additionalHostMatch}` : hostMatch
    }

    const middleware = new k8s.apiextensions.CustomResource(
      `${asset}-middleware`,
      {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'Middleware',
        metadata: {
          namespace: namespace,
          labels: labels,
        },
        spec: {
          stripPrefix: {
            prefixes: Object.values(services).reduce<Array<string>>((prev, { ports }) => {
              const prefixes = ports.reduce<Array<string>>((prev, { pathPrefix, stripPathPrefix }) => {
                if (!pathPrefix || !stripPathPrefix) return prev
                return [...prev, pathPrefix]
              }, [])
              return [...prev, ...prefixes]
            }, []),
          },
        },
      },
      { provider }
    )

    new k8s.apiextensions.CustomResource(
      `${asset}-ingressroute`,
      {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'IngressRoute',
        metadata: {
          namespace: namespace,
          labels: labels,
        },
        spec: {
          entryPoints: ['web', 'websecure'],
          routes: Object.entries(services)
            .map(([service, { ports }]) =>
              ports
                .filter(({ ingressRoute = true }) => ingressRoute)
                .map(({ port, pathPrefix }) => ({
                  kind: 'Rule',
                  match: match(service, pathPrefix),
                  ...(pathPrefix && {
                    middlewares: [{ name: middleware.metadata.name, namespace: svc.metadata.namespace }],
                  }),
                  services: [
                    {
                      kind: 'Service',
                      name: svc.metadata.name,
                      port: port,
                      namespace: svc.metadata.namespace,
                    },
                  ],
                }))
            )
            .flat(),
          tls: {
            secretName: secretName,
            domains: Object.keys(services).map((service) => ({ main: domain(service) })),
          },
        },
      },
      { provider }
    )

    new k8s.networking.v1.Ingress(
      `${asset}-ingress`,
      {
        metadata: {
          namespace: namespace,
          labels: labels,
        },
        spec: {
          rules: Object.keys(services).map((service) => ({ host: domain(service) })),
        },
      },
      { provider }
    )
  }

  if (namespace == 'unchained-dev') {
    deployReaperCron(asset, config.statefulService, namespace, provider)
  }
}
