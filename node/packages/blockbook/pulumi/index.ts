import { hashElement } from 'folder-hash'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'
import { Config } from '@shapeshiftoss/common-pulumi'

interface DaemonConfig {
  cpuLimit: string
  cpuRequest: string
  image: string
  memoryLimit: string
  storageClass: 'gp2' | 'hostpath' | 'standard'
  storageSize: string
}

export interface IndexerConfig {
  cpuLimit: string
  cpuRequest: string
  daemon?: DaemonConfig
  memoryLimit: string
  replicas: number
  storageClass: 'gp2' | 'hostpath' | 'standard'
  storageSize: string
}

export async function deployIndexer(
  app: string,
  asset: string,
  provider: k8s.Provider,
  namespace: string,
  config: Pick<Config, 'indexer' | 'dockerhub' | 'isLocal' | 'rootDomainName' | 'environment' | 'network'>
): Promise<void> {
  if (config.indexer === undefined) return

  const tier = 'indexer'
  const labels = { app, asset, tier }
  const name = `${asset}-${tier}`

  const configFile = config.network !== 'mainnet' ? `config-${config.network}.json` : 'config.json'
  const appConfig = new k8s.core.v1.ConfigMap(
    `${name}-config`,
    {
      metadata: {
        namespace: namespace,
      },
      data: {
        'config.json': readFileSync(`../indexer/${configFile}`).toString(),
      },
    },
    { provider }
  )

  const service = new k8s.core.v1.Service(
    `${name}-svc`,
    {
      metadata: {
        name: `${name}-svc`,
        namespace: namespace,
        labels: labels,
      },
      spec: {
        ports: [
          { port: 8001, name: 'public' },
          { port: 8332, name: 'daemon-rpc' },
        ],
        selector: labels,
        type: 'ClusterIP',
      },
    },
    { provider, deleteBeforeReplace: true }
  )

  const configMap = new k8s.core.v1.ConfigMap(
    `${name}-cm`,
    {
      metadata: {
        namespace: namespace,
        labels: labels,
      },
      data: {
        'liveness.sh': readFileSync('../../../packages/blockbook/scripts/liveness.sh').toString(),
        'readiness.sh': readFileSync('../../../packages/blockbook/scripts/readiness.sh').toString(),
        ...(config.indexer.daemon && {
          'init.sh': readFileSync('../daemon/init.sh').toString(),
          'daemon-readiness.sh': readFileSync('../daemon/readiness.sh').toString(),
        }),
      },
    },
    { provider }
  )

  const { hash: tag } = await hashElement(`../../../packages/blockbook/Dockerfile`, { encoding: 'hex' })

  const podSpec: k8s.types.input.core.v1.PodTemplateSpec = {
    metadata: {
      namespace: namespace,
      labels: labels,
    },
    spec: {
      containers: [
        {
          name: name,
          image: config.dockerhub
            ? `${config.dockerhub.server}/${config.dockerhub.username}/unchained-blockbook:${tag}`
            : `docker.io/shapeshiftdao/unchained-blockbook:${tag}`,
          ...(config.isLocal && { imagePullPolicy: 'Never' }),
          ports: [{ containerPort: 8001, name: 'public' }],
          command: [
            '/bin/blockbook',
            '-blockchaincfg=/config/config.json',
            '-datadir=/data',
            '-sync',
            '-public=:8001',
            '-enablesubnewtx',
            '-logtostderr',
            '-debug',
          ],
          volumeMounts: [
            {
              name: 'data',
              mountPath: '/data',
            },
            {
              name: `${name}-config`,
              mountPath: '/config/config.json',
              subPath: 'config.json',
            },
          ],
          resources: {
            limits: {
              cpu: config.indexer.cpuLimit,
              memory: config.indexer.memoryLimit,
            },
            requests: {
              cpu: config.indexer.cpuRequest ?? config.indexer.cpuLimit,
            },
          },
        },
        {
          name: `${name}-monitor`,
          image: 'shapeshiftdao/unchained-probe:1.0.0',
          readinessProbe: {
            exec: {
              command: ['/readiness.sh'],
            },
            initialDelaySeconds: 20,
            periodSeconds: 5,
            failureThreshold: 12,
            successThreshold: 1,
          },
          livenessProbe: {
            exec: {
              command: ['/liveness.sh'],
            },
            timeoutSeconds: 10,
            initialDelaySeconds: 60,
            periodSeconds: 15,
            failureThreshold: 4,
            successThreshold: 1,
          },
          volumeMounts: [
            {
              name: 'config-map',
              mountPath: '/liveness.sh',
              subPath: 'liveness.sh',
            },
            {
              name: 'config-map',
              mountPath: '/readiness.sh',
              subPath: 'readiness.sh',
            },
          ],
        },
        ...(config.indexer.daemon
          ? [
              {
                name: `${asset}-daemon`,
                image: config.indexer.daemon.image,
                command: ['/init.sh'],
                env: [{ name: 'NETWORK', value: config.network }],
                resources: {
                  limits: {
                    cpu: config.indexer.daemon.cpuLimit,
                    memory: config.indexer.daemon.memoryLimit,
                  },
                  requests: {
                    cpu: config.indexer.daemon.cpuRequest ?? config.indexer.daemon.cpuLimit,
                  },
                },
                ports: [{ containerPort: 8332, name: 'daemon-rpc' }],
                securityContext: { runAsUser: 0 },
                volumeMounts: [
                  {
                    name: 'data-daemon',
                    mountPath: '/data',
                  },
                  {
                    name: 'config-map',
                    mountPath: '/init.sh',
                    subPath: 'init.sh',
                  },
                ],
              },
              {
                name: `${asset}-daemon-monitor`,
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
          : []),
      ],
      volumes: [
        {
          name: `${name}-config`,
          configMap: {
            name: appConfig.metadata.name,
            defaultMode: 0o755,
          },
        },
        {
          name: 'config-map',
          configMap: {
            name: configMap.metadata.name,
            defaultMode: 0o755,
          },
        },
      ],
      terminationGracePeriodSeconds: 120,
    },
  }

  new k8s.apps.v1.StatefulSet(
    `${name}-sts`,
    {
      metadata: {
        name: `${name}-sts`,
        namespace: namespace,
        annotations: { 'pulumi.com/skipAwait': 'true' },
      },
      spec: {
        selector: { matchLabels: labels },
        serviceName: `${name}-svc`,
        replicas: config.indexer.replicas,
        podManagementPolicy: 'OrderedReady',
        updateStrategy: {
          type: 'RollingUpdate',
        },
        template: podSpec,
        volumeClaimTemplates: [
          {
            metadata: {
              name: 'data',
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: config.indexer.storageClass,
              resources: {
                requests: {
                  storage: config.indexer.storageSize,
                },
              },
            },
          },
          {
            ...(config.indexer.daemon && {
              metadata: {
                name: 'data-daemon',
              },
              spec: {
                accessModes: ['ReadWriteOnce'],
                storageClassName: config.indexer.daemon.storageClass,
                resources: {
                  requests: {
                    storage: config.indexer.daemon.storageSize,
                  },
                },
              },
            }),
          },
        ],
      },
    },
    { provider }
  )

  if (config.rootDomainName) {
    const domain = (service: string) => {
      return config.environment
        ? `${config.environment}.${service}.${asset}.${config.rootDomainName}`
        : `${service}.${asset}.${config.rootDomainName}`
    }

    const secretName = `${name}-cert-secret`

    new k8s.apiextensions.CustomResource(
      `${name}-cert`,
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
          dnsNames: [domain('indexer'), domain('daemon')],
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
      return config.environment
        ? `${config.environment}-${service}.${asset}.${additionalRootDomainName}`
        : `${service}.${asset}.${additionalRootDomainName}`
    }
    const extraMatch = (service: string) =>
      additionalRootDomainName ? ` || Host(\`${additionalDomain(service)}\`)` : ''

    new k8s.apiextensions.CustomResource(
      `${name}-ingressroute`,
      {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'IngressRoute',
        metadata: {
          namespace: namespace,
          labels: labels,
        },
        spec: {
          entryPoints: ['web', 'websecure'],
          routes: [
            {
              match: `Host(\`${domain('indexer')}\`)` + extraMatch('indexer'),
              kind: 'Rule',
              services: [
                {
                  kind: 'Service',
                  name: service.metadata.name,
                  port: service.spec.ports[0].port,
                  namespace: service.metadata.namespace,
                },
              ],
            },
            {
              match: `Host(\`${domain('daemon')}\`)` + extraMatch('daemon'),
              kind: 'Rule',
              services: [
                {
                  kind: 'Service',
                  name: service.metadata.name,
                  port: service.spec.ports[1].port,
                  namespace: service.metadata.namespace,
                },
              ],
            },
          ],
          tls: {
            secretName: secretName,
            domains: [{ main: domain('indexer') }, { main: domain('daemon') }],
          },
        },
      },
      { provider }
    )

    new k8s.networking.v1.Ingress(
      `${name}-ingress`,
      {
        metadata: {
          namespace: namespace,
          labels: labels,
        },
        spec: {
          rules: [{ host: domain('indexer') }, { ...(config.indexer.daemon && { host: domain('daemon') }) }],
        },
      },
      { provider }
    )
  }
}
