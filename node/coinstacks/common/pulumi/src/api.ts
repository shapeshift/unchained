import { createHash } from 'crypto'
import { parse } from 'dotenv'
import { hashElement } from 'folder-hash'
import objectHash from 'object-hash'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as k8s from '@pulumi/kubernetes'
import { Input, Resource } from '@pulumi/pulumi'
import { buildAndPushImage, Config, hasTag, getBaseHash } from './index'

export interface ApiConfig {
  cpuLimit: string
  memoryLimit: string
  replicas: number
  autoscaling: { enabled: boolean; maxReplicas: number; cpuThreshold: number }
  enableDatadogLogs?: boolean
}

// creates a hash of the content included in the final build image
const getHash = async (coinstack: string, buildArgs: Record<string, string>): Promise<string> => {
  const hash = createHash('sha1')

  // hash root level unchained files
  const { hash: unchainedHash } = await hashElement('../../../', {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['package.json', 'lerna.json'] },
  })
  hash.update(unchainedHash)

  // hash contents of packages
  const { hash: packagesHash } = await hashElement('../../../packages', {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(packagesHash)

  // hash contents of common-api
  const { hash: commonApiHash } = await hashElement('../../common/api', {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(commonApiHash)

  // hash contents of coinstack-api
  const { hash: apiHash } = await hashElement(`../../${coinstack}/api`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(apiHash)

  hash.update(objectHash(buildArgs))

  return hash.digest('hex')
}

export async function deployApi(
  app: string,
  asset: string,
  provider: k8s.Provider,
  namespace: string,
  config: Pick<Config, 'api' | 'dockerhub' | 'isLocal' | 'rootDomainName' | 'environment'>,
  deployDependencies: Input<Array<Resource>> = []
): Promise<k8s.apps.v1.Deployment | undefined> {
  if (config.api === undefined) return

  const tier = 'api'
  const labels = { app, asset, tier }
  const [coinstack] = asset.split('-')
  const name = `${asset}-${tier}`

  let imageName = 'mhart/alpine-node:14.17.3' // local dev image
  if (!config.isLocal) {
    const repositoryName = `${app}-${coinstack}-${tier}`
    const baseImageName = `${config.dockerhub?.username ?? 'shapeshiftdao'}/unchained-base:${await getBaseHash()}`
    const buildArgs = {
      BUILDKIT_INLINE_CACHE: '1',
      BASE_IMAGE: baseImageName, // associated base image for dockerhub user expected to exist
    }
    const tag = await getHash(coinstack, buildArgs)

    imageName = `shapeshiftdao/${repositoryName}:${tag}` // default public image
    if (config.dockerhub) {
      const image = `${config.dockerhub.username}/${repositoryName}`

      imageName = `${image}:${tag}` // configured dockerhub image

      if (!(await hasTag(image, tag))) {
        await buildAndPushImage({
          image,
          context: `../../${coinstack}/api`,
          auth: {
            password: config.dockerhub.password,
            username: config.dockerhub.username,
            server: config.dockerhub.server,
          },
          buildArgs,
          env: { DOCKER_BUILDKIT: '1' },
          tags: [tag],
          cacheFroms: [`${image}:${tag}`, `${image}:latest`, baseImageName],
        })
      }
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
        ...(config.isLocal
          ? {
              ports: [{ port: 3000, protocol: 'TCP', name: 'http', nodePort: 31300 }],
              type: 'NodePort',
            }
          : {
              ports: [{ port: 3000, protocol: 'TCP', name: 'http' }],
              type: 'ClusterIP',
            }),
      },
    },
    { provider, deleteBeforeReplace: true }
  )

  if (config.rootDomainName) {
    const subdomain = config.environment ? `${config.environment}.api.${asset}` : `api.${asset}`
    const additionalSubdomain = config.environment ? `${config.environment}-api.${asset}` : `api.${asset}`
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
    const extraMatch = additionalRootDomainName
      ? ` || Host(\`${additionalSubdomain}.${additionalRootDomainName}\`)`
      : ''

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
              match: `Host(\`${domain}\`)` + extraMatch,
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

  const secretEnvs = Object.keys(parse(readFileSync('../sample.env'))).map<k8s.types.input.core.v1.EnvVar>((key) => ({
    name: key,
    valueFrom: { secretKeyRef: { name: asset, key: key } },
  }))

  // Fetch user credentials in secret generated by rabbitmq cluster operator, build URI
  const rabbitCredentials: k8s.types.input.core.v1.EnvVar[] = [
    {
      name: 'BROKER_URI',
      value: 'amqp://guest:guest@$(BROKER_URL)',
    },
  ]

  const datadogAnnotation = config.api.enableDatadogLogs
    ? {
        [`ad.datadoghq.com/${tier}.logs`]: `[{"source": "${app}", "service": "${name}"}]`,
      }
    : {}

  const podSpec: k8s.types.input.core.v1.PodTemplateSpec = {
    metadata: {
      annotations: { ...datadogAnnotation },
      namespace: namespace,
      labels: labels,
    },
    spec: {
      containers: [
        {
          name: tier,
          image: imageName,
          ports: [{ containerPort: 3000, name: 'http' }],
          env: [...secretEnvs, ...rabbitCredentials],
          command: config.isLocal ? ['sh', '-c', 'yarn nodemon'] : ['node', `dist/${coinstack}/api/src/app.js`],
          resources: {
            limits: {
              cpu: config.api.cpuLimit,
              memory: config.api.memoryLimit,
            },
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
          ...(config.isLocal && {
            volumeMounts: [{ name: 'app', mountPath: '/app' }],
            workingDir: `/app/coinstacks/${coinstack}/api`,
          }),
        },
      ],
      ...(config.isLocal && {
        volumes: [{ name: 'app', hostPath: { path: join(__dirname, '../../../../') } }],
      }),
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

  if (config.api.autoscaling.enabled) {
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
