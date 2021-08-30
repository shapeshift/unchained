import * as k8s from '@pulumi/kubernetes'
import { CustomResource, Output } from '@pulumi/pulumi'

export interface MongoConfig {
  cpuLimit: string
  helmChartVersion: string
  memoryLimit: string
  replicaCount: number
  storageClass: 'gp2' | 'hostpath' | 'standard'
  storageSize: string
}

export async function deployMongo(
  app: string,
  asset: string,
  provider: k8s.Provider,
  namespace: string,
  config?: MongoConfig
): Promise<Output<Array<CustomResource>> | undefined> {
  if (config === undefined) return

  const labels = { app, asset, tier: 'mongo' }

  const chart = new k8s.helm.v3.Chart(
    `${asset}-mongodb`,
    {
      repo: 'bitnami',
      chart: 'mongodb',
      namespace: namespace,
      version: config.helmChartVersion,
      values: {
        labels: labels,
        affinity: {
          podAntiAffinity: {
            preferredDuringSchedulingIgnoredDuringExecution: [
              {
                weight: 100,
                podAffinityTerm: {
                  topologyKey: 'failure-domain.beta.kubernetes.io/zone',
                  labelSelector: {
                    matchExpressions: [
                      {
                        key: 'app.kubernetes.io/instance',
                        operator: 'In',
                        values: [`${asset}-mongodb`],
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
        arbiter: { enabled: false },
        architecture: 'replicaset',
        auth: { enabled: false },
        persistence: {
          storageClass: config.storageClass,
          size: config.storageSize,
          volumeClaimTemplates: {
            requests: {
              storage: config.storageSize,
            },
          },
        },
        replicaCount: config.replicaCount,
        resources: {
          limits: {
            cpu: config.cpuLimit,
            memory: config.memoryLimit,
          },
        },
      },
    },
    { provider }
  )

  return chart.ready
}
