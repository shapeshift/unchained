import { join } from 'path'
import * as k8s from '@pulumi/kubernetes'

export async function deployWatcher(app: string, provider: k8s.Provider, namespace: string): Promise<void> {
  if (!provider) return

  const labels = { app: app, tier: 'watcher' }
  const name = `${labels.tier}`

  const podSpec: k8s.types.input.core.v1.PodTemplateSpec = {
    metadata: {
      namespace: namespace,
      labels: labels,
    },
    spec: {
      containers: [
        {
          name: `${labels.tier}`,
          image: 'mhart/alpine-node:14.18.0',
          workingDir: '/app',
          command: ['sh', '-c', 'yarn lerna run watch --scope @shapeshiftoss/* --parallel'],
          volumeMounts: [{ name: 'app', mountPath: '/app' }],
        },
      ],
      volumes: [{ name: 'app', hostPath: { path: join(__dirname, '..') } }],
    },
  }

  new k8s.apps.v1.Deployment(
    `${name}`,
    {
      metadata: {
        name: `${name}`,
        namespace: namespace,
      },
      spec: {
        selector: { matchLabels: labels },
        replicas: 1,
        template: podSpec,
      },
    },
    { provider }
  )
}
