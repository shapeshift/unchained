import * as pulumi from '@pulumi/pulumi'
import * as k8s from '@pulumi/kubernetes'
import { CustomResource } from '@pulumi/pulumi'
import { rabbitmq, types } from './crds/types/rabbitmq'
import { Config } from './index'

export interface RabbitConfig {
  cpuLimit: string
  memoryLimit: string
  replicaCount: number
  storageClass: 'gp2' | 'hostpath' | 'standard'
  storageSize: string
}

export async function deployRabbit(
  app: string,
  asset: string,
  provider: k8s.Provider,
  namespace: string,
  config: Pick<Config, 'rabbit'>
  ): Promise<CustomResource | undefined> {

  const clusterName = `${asset}-rabbitmq`

  const resources: pulumi.Input<types.input.rabbitmq.v1beta1.RabbitmqClusterSpecResourcesArgs> = {
    limits: {
      cpu: config.rabbit?.cpuLimit as pulumi.Input<string>,
      memory: config.rabbit?.memoryLimit as pulumi.Input<string>
    },
    requests: {
      cpu: config.rabbit?.cpuLimit as pulumi.Input<string>,
      memory: config.rabbit?.memoryLimit as pulumi.Input<string>
    }
  }

  const additionalConfig = `
  cluster_partition_handling = pause_minority
  vm_memory_high_watermark_paging_ratio = 0.99
  disk_free_limit.relative = 1.0
  collect_statistics_interval = 10000
  `

  // https://www.rabbitmq.com/kubernetes/operator/using-operator.html#create
  // with some configuration inspired by production-ready example https://github.com/rabbitmq/cluster-operator/blob/main/docs/examples/production-ready/rabbitmq.yaml
  new rabbitmq.v1beta1.RabbitmqCluster(
    clusterName,
    {
      metadata: {
        namespace: namespace,
        name: clusterName,
        labels: { app, asset, tier: 'rabbit' }
      },
      spec: {
        replicas: config.rabbit?.replicaCount,
        rabbitmq: {
          additionalConfig,
        },
        persistence: {
          storageClassName: config.rabbit?.storageClass,
          storage: config.rabbit?.storageSize
        },
        resources: resources,
        service: {
          type: 'ClusterIP',
        },
        affinity: {
          podAntiAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: [
              {
                labelSelector: {
                  matchExpressions: [
                    {
                      key: 'app.kubernetes.io/name',
                      operator: 'In',
                      values: [clusterName],
                    },
                  ],
                },
                topologyKey: 'kubernetes.io/hostname',
              },
            ],
            preferredDuringSchedulingIgnoredDuringExecution: [
              {
                weight: 100,
                podAffinityTerm: {
                  topologyKey: 'failure-domain.beta.kubernetes.io/zone',
                  labelSelector: {
                    matchExpressions: [
                      {
                        key: 'app.kubernetes.io/name',
                        operator: 'In',
                        values: [clusterName],
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    },
    { provider }
  )
  return
}