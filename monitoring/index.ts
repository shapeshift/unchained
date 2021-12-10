import * as k8s from '@pulumi/kubernetes'
import { getConfig } from './config'
import * as grafana from './grafana'
import * as loki from './loki'
import * as prometheus from './prometheus'
import * as rabbitmqExporter from './rabbitmqExporter'
import * as mongodbExporter from './mongodbExporter'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const { kubeconfig, config, domain } = await getConfig()

  const name = 'unchained'
  const namespace = `${name}-monitoring`
  const outputs: Outputs = {}
  const provider = new k8s.Provider('kube-provider', { kubeconfig })

  //Assign higher priority to critical daemonsets (currently node exporter and promtail)
  const priorityClass = new k8s.scheduling.v1.PriorityClass(
    `${name}-monitoring-resources`,
    {
      value: 100,
      description: 'Ensure monitoring resources are scheduled on every node',
    },
    { provider }
  )

  const className = priorityClass.metadata.name

  new grafana.Deployment(
    name,
    {
      namespace: namespace,
      domain: domain,
      githubOrg: config.githubOrg,
      githubOauthID: config.githubOauthID,
      githubOauthSecret: config.githubOauthSecret,
    },
    { provider }
  )

  new loki.Deployment(name, { namespace: namespace, priorityClassName: className }, { provider })

  new prometheus.Deployment(
    name,
    {
      namespace: namespace,
      priorityClassName: className,
      alerting: config.alerting,
      opsgenieApiKey: config.opsgenieApiKey,
    },
    { provider }
  )

  //Find a better way to identify assets in the cluster, fine for now
  const assets = ['bitcoin', 'ethereum']
  assets.map((asset) => {
    new mongodbExporter.Deployment(`${name}-mongo`, { namespace: namespace, asset: asset }, { provider })
    new rabbitmqExporter.Deployment(`${name}-rabbitmq`, { namespace: namespace, asset: asset }, { provider })
  })

  return outputs
}
