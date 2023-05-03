import * as k8s from '@pulumi/kubernetes'
import { readFileSync } from 'fs'
import { Config, Service, CoinServiceArgs } from '.'
import { deployReaperCron } from './reaperCron'
import { VolumeSnapshot } from './snapper'

export function createCoinService(config: CoinServiceArgs, assetName: string, snapshots: VolumeSnapshot[]): Service {
  const name = `${assetName}-${config.name}`

  const ports = Object.entries(config.ports ?? []).map(([name, port]) => ({ name, ...port }))
  const env = Object.entries(config.env ?? []).map(([name, value]) => ({ name, value }))

  const init = (() => {
    try {
      return readFileSync(`../${config.name}/init.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const liveness = (() => {
    try {
      return readFileSync(`../${config.name}/liveness.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const readiness = (() => {
    try {
      return readFileSync(`../${config.name}/readiness.sh`).toString()
    } catch (err) {
      return ''
    }
  })()

  const configMapData = {
    ...(Boolean(init) && { [`${config.name}-init.sh`]: init }),
    ...(Boolean(liveness) && { [`${config.name}-liveness.sh`]: liveness }),
    ...(Boolean(readiness) && { [`${config.name}-readiness.sh`]: readiness }),
    ...(config.configMapData ?? {}),
  }

  const containers: Array<k8s.types.input.core.v1.Container> = []

  const serviceContainer: k8s.types.input.core.v1.Container = {
    name,
    image: config.image,
    command: init && !config.command ? ['/init.sh'] : config.command,
    args: config.args,
    env,
    resources: {
      limits: {
        ...(config.cpuLimit && { cpu: config.cpuLimit }),
        ...(config.memoryLimit && { memory: config.memoryLimit }),
      },
      requests: {
        ...(config.cpuRequest && { cpu: config.cpuRequest }),
        ...(config.memoryRequest && { memory: config.memoryRequest }),
      },
    },
    ports: ports.map(({ port: containerPort, name }) => ({ containerPort, name })),
    securityContext: { runAsUser: 0 },
    volumeMounts: [
      {
        name: `data-${config.name}`,
        mountPath: config.dataDir ?? '/data',
      },
      ...(init
        ? [
            {
              name: 'config-map',
              mountPath: '/init.sh',
              subPath: `${config.name}-init.sh`,
            },
          ]
        : []),
      ...(config.volumeMounts ?? []),
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
          ...config.readinessProbe,
        },
      }),
      ...(liveness && {
        livenessProbe: {
          exec: {
            command: ['/liveness.sh'],
          },
          initialDelaySeconds: 30,
          periodSeconds: 10,
          ...config.livenessProbe,
        },
      }),
      volumeMounts: [
        ...(readiness
          ? [
              {
                name: 'config-map',
                mountPath: '/readiness.sh',
                subPath: `${config.name}-readiness.sh`,
              },
            ]
          : []),
        ...(liveness
          ? [
              {
                name: 'config-map',
                mountPath: '/liveness.sh',
                subPath: `${config.name}-liveness.sh`,
              },
            ]
          : []),
      ],
    }

    containers.push(monitorContainer)
  }

  const snapshot = snapshots.filter(
    (snapshot) => snapshot.metadata.name.includes(config.name) && !!snapshot.status?.readyToUse
  )[0]

  const volumeClaimTemplates = [
    {
      metadata: {
        name: `data-${config.name}`,
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        storageClassName: 'ebs-csi-gp2',
        resources: {
          requests: {
            storage: config.storageSize,
          },
        },
        ...(snapshot && {
          dataSource: {
            name: snapshot.metadata.name,
            kind: snapshot.kind,
            apiGroup: snapshot.apiVersion.split('/')[0],
          },
        }),
      },
    },
  ]

  return {
    name: config.name,
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
      terminationGracePeriodSeconds: 120,
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
        config.environment ? `${config.environment}-${service}` : service
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
            .map((serviceEntry) =>
              serviceEntry.ports
                .filter(({ ingressRoute = true }) => ingressRoute)
                .map(({ port, pathPrefix }) => ({
                  kind: 'Rule',
                  match: match(serviceEntry, pathPrefix),
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
            domains: services.map((serviceEntry) => ({ main: domain(serviceEntry) })),
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
