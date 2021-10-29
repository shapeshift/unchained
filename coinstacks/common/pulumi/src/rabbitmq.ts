import * as pulumi from '@pulumi/pulumi'
import { rabbitmq, types } from './crds/types/rabbitmq'

interface RabbitmqArgs {
  name: string
  namespace?: string
  replicas?: number
  resources?: pulumi.Input<types.input.rabbitmq.v1beta1.RabbitmqClusterSpecResourcesArgs>
  persistence?: pulumi.Input<types.input.rabbitmq.v1beta1.RabbitmqClusterSpecPersistenceArgs>
}

export function deployRabbit(args: RabbitmqArgs, opts?: pulumi.CustomResourceOptions) {
  // Set reasonable defaults if anything optional is not set
  args = setDefaults(args)
  const clusterName = `${args.name}-rabbitmq`

  const additionalConfig = `
cluster_partition_handling = pause_minority
vm_memory_high_watermark_paging_ratio = 0.99
disk_free_limit.relative = 1.0
collect_statistics_interval = 10000
`

  // https://www.rabbitmq.com/kubernetes/operator/using-operator.html#create
  // with some configuration inspired by production-ready example https://github.com/rabbitmq/cluster-operator/blob/main/docs/examples/production-ready/rabbitmq.yaml
  new rabbitmq.v1beta1.RabbitmqCluster(
    args.name,
    {
      metadata: {
        namespace: args.namespace,
        name: clusterName,
      },
      spec: {
        replicas: args.replicas,
        rabbitmq: {
          additionalConfig,
        },
        persistence: args.persistence,
        resources: args.resources,
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
    opts
  )
}

function setDefaults(args: RabbitmqArgs) {
  const result: RabbitmqArgs = args

  if (!result.namespace) result.namespace = 'default'

  if (!result.persistence)
    result.persistence = {
      storage: '50Gi',
      storageClassName: 'gp2',
    }

  if (!result.replicas) result.replicas = 3

  if (!result.resources)
    result.resources = {
      limits: {
        cpu: '2000m',
        memory: '4Gi',
      },
      requests: {
        cpu: '2000m',
        memory: '4Gi',
      },
    }

  return result
}
