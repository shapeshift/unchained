import * as k8s from '@pulumi/kubernetes'
import { CustomResource, Output } from '@pulumi/pulumi'
import { Config } from './index'

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
  config: Pick<Config, 'mongo'>
): Promise<Output<Array<CustomResource>> | undefined> {
  if (config.mongo === undefined) return

  const labels = { app, asset, tier: 'mongo' }

  const chart = new k8s.helm.v3.Chart(
    `${asset}-mongodb`,
    {
      repo: 'bitnami',
      chart: 'mongodb',
      namespace: namespace,
      version: config.mongo.helmChartVersion,
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
          storageClass: config.mongo.storageClass,
          size: config.mongo.storageSize,
          volumeClaimTemplates: {
            requests: {
              storage: config.mongo.storageSize,
            },
          },
        },
        replicaCount: config.mongo.replicaCount,
        resources: {
          limits: {
            cpu: config.mongo.cpuLimit,
            memory: config.mongo.memoryLimit,
          },
        },
      },
    },
    { provider }
  )

  return chart.ready
}
