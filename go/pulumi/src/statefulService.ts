import * as k8s from '@pulumi/kubernetes'
import { readFileSync } from 'fs'
import { Config, Service, ServiceConfig } from '.'

interface Port {
  port: number
  pathPrefix?: string
  stripPathPrefix?: boolean
}

export interface ServiceArgs {
  asset: string
  config: ServiceConfig
  name: string
  ports: Record<string, Port>
  env: Record<string, string>
  dataDir?: string
  configMapData?: Record<string, string>
  volumeMounts?: Array<k8s.types.input.core.v1.VolumeMount>
}

export function createService(args: ServiceArgs): Service {
  const name = `${args.asset}-${args.name}`
  const ports = Object.entries(args.ports).map(([name, { port, pathPrefix, stripPathPrefix }]) => ({ name, port, pathPrefix, stripPathPrefix }))
  const env = Object.entries(args.env).map(([name, value]) => ({ name, value }))

  const configMapData = {
    [`${args.name}-init.sh`]: readFileSync(`../${args.name}/init.sh`).toString(),
    [`${args.name}-readiness.sh`]: readFileSync(`../${args.name}/readiness.sh`).toString(),
    ...(args.configMapData ?? {})
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
      ports: ports.map(({ port: containerPort, name }) => ({ containerPort, name })),
      volumeMounts: [
        {
          name: `data-${args.name}`,
          mountPath: args.dataDir ?? '/data',
        },
        {
          name: 'config-map',
          mountPath: '/init.sh',
          subPath: `${args.name}-init.sh`,
        },
        ...(args.volumeMounts ?? [])
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
          subPath: `${args.name}-readiness.sh`,
        },
      ],
    },
  ]

  const volumeClaimTemplates = [
    {
      metadata: {
        name: `data-${args.name}`,
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

  const labels = { app, asset, tier: "statefulservice" }
  const ports = Object.values(services).reduce<Array<k8s.types.input.core.v1.ServicePort>>((prev, { ports }) => [...prev, ...ports.map(({ name, port }) => ({ name, port }))], [])
  const configMapData = Object.values(services).reduce<Record<string, string>>((prev, { configMapData }) => ({ ...prev, ...configMapData }), {})
  const containers = Object.values(services).reduce<Array<k8s.types.input.core.v1.Container>>((prev, { containers }) => prev.concat(...containers), [])
  const volumeClaimTemplates = Object.values(services).reduce<Array<k8s.types.input.core.v1.PersistentVolumeClaim>>((prev, { volumeClaimTemplates }) => prev.concat(...volumeClaimTemplates), [])

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
        ...(volumes ?? [])
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
        podManagementPolicy: 'OrderedReady',
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
          dnsNames: Object.keys(services).map(service => domain(service)),
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

    const additionalDomain = (service: string) => {
      const baseDomain = `${service}.${asset}.${additionalRootDomainName}`
      return config.environment ? `${config.environment}-${baseDomain}` : baseDomain
    }

    const match = (service: string, prefix?: string) => {
      const pathPrefixMatch = prefix ? ` && PathPrefix(\`${prefix}\`)` : ''
      const hostMatch = `(Host(\`${domain(`${service}`)}\`)${pathPrefixMatch})`
      const additionalHostMatch = `(Host(\`${additionalDomain(`${service}`)}\`)${pathPrefixMatch})`
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
            }, [])
          }
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
          routes: Object.entries(services).map(([service, { ports }]) => ports.map(({ port, pathPrefix }) => (
            {
              kind: 'Rule',
              match: match(service, pathPrefix),
              middlewares: [{ name: middleware.metadata.name, namespace: svc.metadata.namespace }],
              services: [
                {
                  kind: 'Service',
                  name: svc.metadata.name,
                  port: port,
                  namespace: svc.metadata.namespace,
                },
              ],
            }))).flat(),
          tls: {
            secretName: secretName,
            domains: Object.keys(services).map(service => ({ main: domain(service) })),
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
          rules: Object.keys(services).map(service => ({ host: domain(service) })),
        },
      },
      { provider }
    )
  }
}
