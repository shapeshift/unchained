import { createHash } from 'crypto'
import { parse } from 'dotenv'
import { hashElement } from 'folder-hash'
import objectHash from 'object-hash'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as k8s from '@pulumi/kubernetes'
import { Input, Resource } from '@pulumi/pulumi'
import { buildAndPushImage, Config, hasTag } from './index'

export interface Autoscaling {
  enabled: boolean,
  maxReplicas: number,
  cpuThreshold: number
}

export interface ApiConfig {
  cpuLimit: string
  memoryLimit: string
  replicas: number
  autoscaling?: Autoscaling
}

// creates a hash of the content included in the final build image
const getHash = async (coinstack: string, buildArgs: Record<string, string>): Promise<string> => {
  const hash = createHash('sha1')

  // hash go module files
  const { hash: unchainedHash } = await hashElement('../../../', {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['go.mod', 'go.sum'] },
  })
  hash.update(unchainedHash)

  // hash build files
  const { hash: buildHash } = await hashElement('../../../build', {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['Dockerfile'] },
  })
  hash.update(buildHash)

  // hash contents of static
  const { hash: staticHash } = await hashElement('../../../static', {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*'] },
  })
  hash.update(staticHash)

  // hash contents of internal
  const { hash: internalHash } = await hashElement('../../../internal', {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go'] },
  })
  hash.update(internalHash)

  // hash contents of cmd
  const { hash: cmdHash } = await hashElement(`../../../cmd/${coinstack}`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go', 'sample.env'] },
  })
  hash.update(cmdHash)

  // hash contents of pkg
  const { hash: pkgHash } = await hashElement('../../../pkg', {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go'] },
  })
  hash.update(pkgHash)

  // hash contents of coinstack api
  const { hash: coinstackHash } = await hashElement(`../../${coinstack}/api`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go', '*.json'] },
  })
  hash.update(coinstackHash)

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

  let imageName = 'golang:1.17.6-alpine' // local dev image
  if (!config.isLocal) {
    const repositoryName = `${app}-${coinstack}-${tier}`
    const buildArgs = { BUILDKIT_INLINE_CACHE: '1', COINSTACK: coinstack }
    const tag = await getHash(coinstack, buildArgs)

    imageName = `shapeshiftdao/${repositoryName}:${tag}` // default public image
    if (config.dockerhub) {
      const image = `${config.dockerhub.username}/${repositoryName}`

      imageName = `${image}:${tag}` // configured dockerhub image

      if (!(await hasTag(image, tag))) {
        await buildAndPushImage({
          image,
          context: `../../../build`,
          auth: {
            password: config.dockerhub.password,
            username: config.dockerhub.username,
            server: config.dockerhub.server,
          },
          buildArgs,
          env: { DOCKER_BUILDKIT: '1' },
          tags: [tag],
          cacheFroms: [`${image}:${tag}`, `${image}:latest`],
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

  const secretEnvs = Object.keys(parse(readFileSync(`../../../cmd/${coinstack}/sample.env`))).map<k8s.types.input.core.v1.EnvVar>((key) => ({
    name: key,
    valueFrom: { secretKeyRef: { name: asset, key: key } },
  }))

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
          env: [...secretEnvs],
          command: config.isLocal ? ['sh', '-c', `go run cmd/${coinstack}/main.go`] : ['-swagger', 'swagger.json'],
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
            workingDir: `/app`,
          }),
        },
      ],
      ...(config.isLocal && {
        volumes: [{ name: 'app', hostPath: { path: join(__dirname, '../../../go') } }],
      }),
    },
  }

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
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: name,
          },
          targetCPUUtilizationPercentage: config.api.autoscaling.cpuThreshold,
        },
      },
      { provider }
    )
  }

  return new k8s.apps.v1.Deployment(
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
}
