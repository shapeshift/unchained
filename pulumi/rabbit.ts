import * as k8s from '@pulumi/kubernetes'
import { Config } from './config'

export interface RabbitConfig {
  adminPort?: number
  cpuLimit: string
  memoryLimit: string
  rabbitPort?: number
  storageClassName: 'hostpath' | 'standard' | 'gp2'
  storageSize: string
}

export async function deployRabbit(
  app: string,
  provider: k8s.Provider,
  namespace: string,
  config: Pick<Config, 'rabbit' | 'dockerhub' | 'isLocal'>
): Promise<void> {
  if (config.rabbit === undefined) return

  const labels = { app: app, tier: 'rabbitmq' }

  new k8s.core.v1.Service(
    `${labels.tier}-svc`,
    {
      metadata: {
        name: `${labels.tier}-svc`,
        namespace: namespace,
        labels: labels,
      },
      spec: {
        selector: labels,
        ...(config.isLocal
          ? {
              ports: [
                { port: 5672, protocol: 'TCP', name: 'rabbitmq', nodePort: config.rabbit.rabbitPort },
                { port: 15672, protocol: 'TCP', name: 'rabbitmqadmin', nodePort: config.rabbit.adminPort },
              ],
              type: 'NodePort',
            }
          : {
              ports: [
                { port: 5672, protocol: 'TCP', name: 'rabbitmq' },
                { port: 15672, protocol: 'TCP', name: 'rabbitmqadmin' },
              ],
              type: 'ClusterIP',
            }),
      },
    },
    { provider, deleteBeforeReplace: true }
  )

  const container: k8s.types.input.core.v1.Container = {
    name: 'rabbitmq',
    image: 'rabbitmq:3.8.2-management-alpine',
    env: [{ name: 'RABBITMQ_VM_MEMORY_HIGH_WATERMARK', value: '1.0' }],
    ports: [
      { name: 'rabbitmq', containerPort: 5672 },
      { name: 'rabbitmqadmin', containerPort: 15672 },
    ],
    resources: {
      limits: {
        cpu: config.rabbit.cpuLimit,
        memory: config.rabbit.memoryLimit,
      },
    },
    volumeMounts: [
      {
        name: 'data',
        mountPath: '/var/lib/rabbitmq',
      },
    ],
  }

  const podSpec: k8s.types.input.core.v1.PodTemplateSpec = {
    metadata: {
      namespace: namespace,
      labels: labels,
    },
    spec: {
      containers: [container],
    },
  }

  new k8s.apps.v1.StatefulSet(
    `${labels.tier}-sts`,
    {
      metadata: {
        namespace: namespace,
        labels: labels,
      },
      spec: {
        selector: { matchLabels: labels },
        serviceName: `${labels.tier}-svc`,
        replicas: 1,
        template: podSpec,
        volumeClaimTemplates: [
          {
            metadata: {
              name: 'data',
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: config.rabbit.storageClassName,
              resources: {
                requests: {
                  storage: config.rabbit.storageSize,
                },
              },
            },
          },
        ],
      },
    },
    { provider }
  )
}
