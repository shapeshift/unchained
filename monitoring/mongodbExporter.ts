import * as k8s from '@pulumi/kubernetes'
import * as pulumi from '@pulumi/pulumi'

export interface deploymentArgs {
  namespace: pulumi.Input<string>
  asset: string
}

export class Deployment extends k8s.helm.v3.Chart {
  constructor(name: string, args: deploymentArgs, opts?: pulumi.ComponentResourceOptions) {
    super(
      `${name}-${args.asset}`,
      {
        // https://github.com/grafana/helm-charts/tree/main/charts/grafana
        chart: 'prometheus-mongodb-exporter',
        repo: 'prometheus-community',
        namespace: args.namespace,
        version: '2.8.1',
        values: {
          podAnnotations: {
            'prometheus.io/scrape': 'true',
            'prometheus.io/path': '/metrics',
            'prometheus.io/port': '9216'
          },
          mongodb: {
            uri: `mongodb://${args.asset}-mongodb-0.${args.asset}-mongodb-headless.unchained.svc.cluster.local:27017,${args.asset}-mongodb-1.${args.asset}-mongodb-headless.unchained.svc.cluster.local:27017,${args.asset}-mongodb-2.${args.asset}-mongodb-headless.unchained.svc.cluster.local:27017/?replicaSet=rs0`,
          },
          resources: {
            limits: {
              cpu: '200m',
              memory: '256Mi',
            },
            requests: {
                cpu: '200m',
                memory: '256Mi',
            },
          },
          serviceMonitor: {
              enabled: false
          }
        },
      },
      { ...opts }
    )
  }
}
