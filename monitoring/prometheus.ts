import * as k8s from '@pulumi/kubernetes'
import * as pulumi from '@pulumi/pulumi'

export interface deploymentArgs {
  namespace: pulumi.Input<string>
  priorityClassName: pulumi.Output<string>
}

export class Deployment extends k8s.helm.v3.Chart {
  constructor(name: string, args: deploymentArgs, opts?: pulumi.ComponentResourceOptions) {
    super(
      `${name}-prometheus`,
      {
        // https://github.com/grafana/helm-charts/tree/main/charts/grafana
        chart: 'prometheus',
        repo: 'prometheus-community',
        namespace: args.namespace,
        version: '14.11.1',
        values: {
          alertmanager: {
            persistentVolume: {
              size: '3Gi',
            },
            statefulSet: {
              enabled: true,
            },
            resources: {
              limits: {
                cpu: '400m',
                memory: '512Mi',
              },
              requests: {
                cpu: '400m',
                memory: '512Mi',
              },
            },
          },
          nodeExporter: {
            priorityClassName: args.priorityClassName,
            resources: {
              limits: {
                cpu: '100m',
                memory: '256Mi',
              },
              requests: {
                cpu: '50m',
                memory: '256Mi',
              },
            },
          },
          pushgateway: {
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
          server: {
            persistentVolume: {
              size: '20Gi',
            },
            statefulSet: {
              enabled: true,
            },
            resources: {
              limits: {
                cpu: '2',
                memory: '8Gi',
              },
              requests: {
                cpu: '2',
                memory: '8Gi',
              },
            },
          },
        },
      },
      { ...opts }
    )
  }
}
