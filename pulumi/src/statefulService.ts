import * as k8s from '@pulumi/kubernetes'
import { readFileSync } from 'fs'
import { Config, Service, CoinServiceArgs } from '.'
import { deployReaperCron } from './reaperCron'

export function createCoinService(args: CoinServiceArgs, assetName: string): Service {
  const name = `${assetName}-${args.name}`

  const ports = Object.entries(args.ports ?? []).map(([name, port]) => ({ name, ...port }))
  const env = Object.entries(args.env ?? []).map(([name, value]) => ({ name, value }))

  const initScript = (() => {
    try {
      return readFileSync(`../${args.name}/init.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const startupProbe = (() => {
    try {
      return readFileSync(`../${args.name}/startup.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const livenessProbe = (() => {
    try {
      return readFileSync(`../${args.name}/liveness.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const readinessProbe = (() => {
    try {
      return readFileSync(`../${args.name}/readiness.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const configMapData = {
    ...(Boolean(initScript) && { [`${args.name}-init.sh`]: initScript }),
    ...(Boolean(startupProbe) && { [`${args.name}-startup.sh`]: startupProbe }),
    ...(Boolean(livenessProbe) && { [`${args.name}-liveness.sh`]: livenessProbe }),
    ...(Boolean(readinessProbe) && { [`${args.name}-readiness.sh`]: readinessProbe }),
    ...(args.configMapData ?? {}),
  }

  const containers: Array<k8s.types.input.core.v1.Container> = []

  const serviceContainer: k8s.types.input.core.v1.Container = {
    name,
    image: args.image,
    command: initScript && !args.command ? ['/init.sh'] : args.command,
    args: args.args,
    env,
    resources: {
      limits: {
        ...(args.cpuLimit && { cpu: args.cpuLimit }),
        ...(args.memoryLimit && { memory: args.memoryLimit }),
      },
      requests: {
        ...(args.cpuRequest && { cpu: args.cpuRequest }),
        ...(args.memoryRequest && { memory: args.memoryRequest }),
      },
    },
    ports: ports.map(({ port: containerPort, name }) => ({ containerPort, name })),
    securityContext: { runAsUser: 0 },
    ...((startupProbe || args.startupProbe) && {
      startupProbe: {
        ...(startupProbe && { exec: { command: ['/startup.sh'] }, initialDelaySeconds: 30 }),
        ...args.startupProbe,
      },
    }),
    ...((livenessProbe || args.livenessProbe) &&
      args.livenessProbe && {
        livenessProbe: {
          ...(livenessProbe && { exec: { command: ['/liveness.sh'] }, initialDelaySeconds: 30 }),
          ...args.livenessProbe,
        },
      }),
    ...(!args.useMonitorContainer &&
      (readinessProbe || args.readinessProbe) &&
      args.readinessProbe && {
        readinessProbe: {
          ...(readinessProbe && { exec: { command: ['/readiness.sh'] }, initialDelaySeconds: 30 }),
          ...args.readinessProbe,
        },
      }),
    volumeMounts: [
      {
        name: `data-${args.name}`,
        mountPath: args.dataDir ?? '/data',
      },
      ...(initScript
        ? [
            {
              name: 'config-map',
              mountPath: '/init.sh',
              subPath: `${args.name}-init.sh`,
            },
          ]
        : []),
      ...(startupProbe
        ? [
            {
              name: 'config-map',
              mountPath: '/startup.sh',
              subPath: `${args.name}-startup.sh`,
            },
          ]
        : []),
      ...(livenessProbe
        ? [
            {
              name: 'config-map',
              mountPath: '/liveness.sh',
              subPath: `${args.name}-liveness.sh`,
            },
          ]
        : []),
      ...(readinessProbe
        ? [
            {
              name: 'config-map',
              mountPath: '/readiness.sh',
              subPath: `${args.name}-readiness.sh`,
            },
          ]
        : []),
      ...(args.volumeMounts ?? []),
    ],
  }

  containers.push(serviceContainer)

  if (args.useMonitorContainer && readinessProbe) {
    const monitorContainer: k8s.types.input.core.v1.Container = {
      name: `${name}-monitor`,
      image: 'shapeshiftdao/unchained-probe:1.0.0',
      env,
      ...(readinessProbe && {
        readinessProbe: {
          exec: {
            command: ['/readiness.sh'],
          },
          initialDelaySeconds: 30,
          ...args.readinessProbe,
        },
      }),
      volumeMounts: [
        ...(readinessProbe
          ? [
              {
                name: 'config-map',
                mountPath: '/readiness.sh',
                subPath: `${args.name}-readiness.sh`,
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
        name: `data-${args.name}`,
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        storageClassName: 'ebs-csi-gp2',
        resources: {
          requests: {
            storage: args.storageSize,
          },
        },
      },
    },
  ]

  return {
    name: args.name,
    configMapData,
    containers,
    ports,
    volumeClaimTemplates,
  }
}

export async function deployStatefulService(
  appName: string,
  assetName: string,
  provider: k8s.Provider,
  namespace: string,
  config: Pick<Config, 'rootDomainName' | 'environment' | 'statefulService'>,
  services: Service[],
  volumes?: Array<k8s.types.input.core.v1.Volume>
): Promise<void> {
  if (!config.statefulService) return
  if (config.statefulService.replicas <= 0) return
  if (!services.length) return

  const labels = { app: appName, asset: assetName, tier: 'statefulservice' }

  const ports = services.reduce<Array<k8s.types.input.core.v1.ServicePort>>(
    (prev, { ports }) => [...prev, ...ports.map(({ name, port }) => ({ name, port }))],
    []
  )

  const configMapData = services.reduce<Record<string, string>>(
    (prev, { configMapData }) => ({ ...prev, ...configMapData }),
    {}
  )

  const containers = services.reduce<Array<k8s.types.input.core.v1.Container>>(
    (prev, { containers }) => prev.concat(...containers),
    []
  )

  const volumeClaimTemplates = services.reduce<Array<k8s.types.input.core.v1.PersistentVolumeClaim>>(
    (prev, { volumeClaimTemplates }) => prev.concat(...volumeClaimTemplates),
    []
  )

  const svc = new k8s.core.v1.Service(
    `${assetName}-svc`,
    {
      metadata: {
        name: `${assetName}-svc`,
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
    `${assetName}-cm`,
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
      terminationGracePeriodSeconds: 600,
    },
  }

  new k8s.apps.v1.StatefulSet(
    `${assetName}-sts`,
    {
      metadata: {
        name: `${assetName}-sts`,
        namespace: namespace,
        annotations: { 'pulumi.com/skipAwait': 'true' },
      },
      spec: {
        selector: { matchLabels: labels },
        serviceName: `${assetName}-svc`,
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
    const domain = (service: Service) => {
      const baseDomain = `${service.name}.${assetName}.${config.rootDomainName}`
      return config.environment ? `${config.environment}.${baseDomain}` : baseDomain
    }

    const secretName = `${assetName}-cert-secret`

    new k8s.apiextensions.CustomResource(
      `${assetName}-cert`,
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
          dnsNames: services.map((service) => domain(service)),
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

    const match = (service: Service, prefix?: string) => {
      const pathPrefixMatch = prefix ? ` && PathPrefix(\`${prefix}\`)` : ''
      const hostMatch = `(Host(\`${domain(service)}\`)${pathPrefixMatch})`
      const additionalHostMatch = `(Host(\`${
        config.environment ? `${config.environment}-${service.name}` : service.name
      }.${assetName}.${additionalRootDomainName}\`)${pathPrefixMatch})`
      return additionalRootDomainName ? `${hostMatch} || ${additionalHostMatch}` : hostMatch
    }

    const middleware = new k8s.apiextensions.CustomResource(
      `${assetName}-middleware`,
      {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'Middleware',
        metadata: {
          namespace: namespace,
          labels: labels,
        },
        spec: {
          stripPrefix: {
            prefixes: services.reduce<Array<string>>((prev, { ports }) => {
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
      `${assetName}-ingressroute`,
      {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'IngressRoute',
        metadata: {
          namespace: namespace,
          labels: labels,
        },
        spec: {
          entryPoints: ['web', 'websecure'],
          routes: services
            .map((service) =>
              service.ports
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
            domains: services.map((service) => ({ main: domain(service) })),
          },
        },
      },
      { provider }
    )

    new k8s.networking.v1.Ingress(
      `${assetName}-ingress`,
      {
        metadata: {
          namespace: namespace,
          labels: labels,
        },
        spec: {
          rules: services.map((service) => ({ host: domain(service) })),
        },
      },
      { provider }
    )
  }

  if (namespace == 'unchained-dev') {
    deployReaperCron(assetName, config.statefulService, namespace, provider)
  }
}
