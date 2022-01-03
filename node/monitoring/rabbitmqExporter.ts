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
        //TODO: Fix naming convention of exporters
        // https://github.com/grafana/helm-charts/tree/main/charts/grafana
        chart: 'prometheus-rabbitmq-exporter',
        repo: 'prometheus-community',
        namespace: args.namespace,
        version: '1.0.0',
        values: {
          annotations: {
            'prometheus.io/scrape': 'true',
            'prometheus.io/path': '/metrics',
            'prometheus.io/port': '9419',
          },
          rabbitmq: {
            url: `http://${args.asset}-rabbitmq-svc.unchained.svc.cluster.local:15672`,
            user: 'guest',
            password: 'guest',
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
        },
      },
      { ...opts }
    )
  }
}
