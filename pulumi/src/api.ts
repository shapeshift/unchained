import * as k8s from '@pulumi/kubernetes'
import { Input, Resource } from '@pulumi/pulumi'
import { buildAndPushImage, BuildAndPushImageArgs, CoinStackConfig, hasTag } from './index'

export interface Autoscaling {
  enabled: boolean
  maxReplicas: number
  cpuThreshold: number
}

export interface ApiConfig {
  cpuLimit: string
  cpuRequest?: string
  memoryLimit: string
  replicas: number
  autoscaling?: Autoscaling
}

export interface DeployApiArgs {
  app: string
  asset: string
  baseImageName?: string
  buildAndPushImageArgs: Pick<BuildAndPushImageArgs, 'context' | 'dockerFile'>
  config: Pick<CoinStackConfig, 'api' | 'dockerhub' | 'rootDomainName' | 'environment'>
  container: Partial<Pick<k8s.types.input.core.v1.Container, 'args' | 'command'>>
  deployDependencies?: Input<Array<Resource>>
  getHash: (coinstack: string, buildArgs: Record<string, string>) => Promise<string>
  namespace: string
  provider: k8s.Provider
  secretEnvs: (coinstack: string, asset: string) => k8s.types.input.core.v1.EnvVar[]
}

export async function deployApi(args: DeployApiArgs): Promise<k8s.apps.v1.Deployment | undefined> {
  const {
    app,
    asset,
    baseImageName,
    buildAndPushImageArgs,
    config,
    container,
    deployDependencies = [],
    getHash,
    namespace,
    provider,
    secretEnvs,
  } = args

  if (config.api === undefined) return

  const tier = 'api'
  const labels = { app, asset, tier }
  const name = `${asset}-${tier}`
  const [coinstack] = asset.split('-')

  const buildArgs: Record<string, string> = { BUILDKIT_INLINE_CACHE: '1', COINSTACK: coinstack }
  if (baseImageName) buildArgs.BASE_IMAGE = baseImageName

  const tag = await getHash(coinstack, buildArgs)
  const repositoryName = `${app}-${coinstack}-${tier}`

  let imageName = `shapeshiftdao/${repositoryName}:${tag}` // default public image
  if (config.dockerhub) {
    const image = `${config.dockerhub.username}/${repositoryName}`

    const cacheFroms = [`${image}:${tag}`, `${image}:latest`]
    if (baseImageName) cacheFroms.push(baseImageName)

    imageName = `${image}:${tag}` // configured dockerhub image

    if (!(await hasTag(image, tag))) {
      await buildAndPushImage({
        image,
        auth: {
          password: config.dockerhub.password,
          username: config.dockerhub.username,
          server: config.dockerhub.server,
        },
        buildArgs,
        env: { DOCKER_BUILDKIT: '1' },
        tags: [tag],
        cacheFroms,
        ...buildAndPushImageArgs,
      })
    }
  }

  const service = new k8s.core.v1.Service(
    `${name}-svc`,
    {
      metadata: {
        name: `${name}-svc`,
        namespace: namespace,
        labels: labels,
      },
      spec: {
        selector: labels,
        ports: [{ port: 3000, protocol: 'TCP', name: 'http' }],
        type: 'ClusterIP',
      },
    },
    { provider, deleteBeforeReplace: true }
  )

  if (config.rootDomainName) {
    const subdomain = config.environment ? `${config.environment}.api.${asset}` : `api.${asset}`
    const domain = `${subdomain}.${config.rootDomainName}`

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
          dnsNames: [domain],
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
    const hostMatch = `Host(\`${domain}\`)`
    const additionalHostMatch = `Host(\`${
      config.environment ? `${config.environment}-api` : 'api'
    }.${asset}.${additionalRootDomainName}\`)`

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
              match: additionalRootDomainName ? `${hostMatch} || ${additionalHostMatch}` : hostMatch,
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
          ],
          tls: {
            secretName: secretName,
            domains: [{ main: domain }],
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
          rules: [{ host: domain }],
        },
      },
      { provider }
    )
  }

  const podSpec: k8s.types.input.core.v1.PodTemplateSpec = {
    metadata: {
      namespace: namespace,
      labels: labels,
    },
    spec: {
      containers: [
        {
          name: tier,
          image: imageName,
          ports: [{ containerPort: 3000, name: 'http' }],
          env: [...secretEnvs(coinstack, asset)],
          resources: {
            limits: {
              cpu: config.api.cpuLimit,
              memory: config.api.memoryLimit,
            },
            ...(config.api.cpuRequest && {
              requests: {
                cpu: config.api.cpuRequest,
              },
            }),
          },
          readinessProbe: {
            httpGet: { path: '/health', port: 3000 },
            initialDelaySeconds: 10,
            periodSeconds: 5,
            failureThreshold: 3,
            successThreshold: 1,
          },
          livenessProbe: {
            httpGet: { path: '/health', port: 3000 },
            initialDelaySeconds: 30,
            periodSeconds: 5,
            failureThreshold: 3,
            successThreshold: 1,
          },
          ...container,
        },
      ],
    },
  }

  const apiDeployment = new k8s.apps.v1.Deployment(
    name,
    {
      metadata: {
        namespace: namespace,
      },
      spec: {
        selector: { matchLabels: labels },
        replicas: config.api.replicas,
        template: podSpec,
      },
    },
    { provider, dependsOn: deployDependencies }
  )

  if (config.api.autoscaling?.enabled) {
    new k8s.autoscaling.v1.HorizontalPodAutoscaler(
      name,
      {
        metadata: {
          namespace: namespace,
        },
        spec: {
          minReplicas: config.api.replicas,
          maxReplicas: config.api.autoscaling.maxReplicas,
          scaleTargetRef: {
            apiVersion: apiDeployment.apiVersion,
            kind: apiDeployment.kind,
            name: apiDeployment.metadata.name,
          },
          targetCPUUtilizationPercentage: config.api.autoscaling.cpuThreshold,
        },
      },
      { provider }
    )
  }

  return apiDeployment
}
