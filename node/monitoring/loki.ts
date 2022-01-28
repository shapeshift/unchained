import * as k8s from '@pulumi/kubernetes'
import * as pulumi from '@pulumi/pulumi'

export interface deploymentArgs {
  namespace: pulumi.Input<string>
  priorityClassName: pulumi.Output<string>
}

export class Deployment extends pulumi.ComponentResource {
  constructor(name: string, args: deploymentArgs, opts?: pulumi.ComponentResourceOptions) {
    super('loki', name, {}, opts)

    new k8s.helm.v3.Chart(
      `${name}-loki`,
      {
        // https://github.com/grafana/helm-charts/tree/main/charts/loki
        chart: 'loki',
        repo: 'grafana',
        namespace: args.namespace,
        version: '2.6.0',
        values: {
          config: {
            compactor: {
              compaction_interval: '10m',
              retention_enabled: true,
              retention_delete_delay: '2h',
              retention_delete_worker_count: 150,
            },
            limits_config: {
              retention_period: '336h',
            },
          },
          persistence: {
            enabled: true,
            size: '50Gi',
          },
          resources: {
            limits: {
              cpu: '500m',
              memory: '4Gi',
            },
            requests: {
              cpu: '500m',
              memory: '4Gi',
            },
          },
          // Work around ro-filesystem issue (https://github.com/grafana/helm-charts/issues/609)
          extraVolumes: [
            {
              name: 'temp',
              emptyDir: {},
            },
          ],
          extraVolumeMounts: [
            {
              name: 'temp',
              mountPath: '/tmp',
            },
          ],
        },
      },
      { ...opts }
    )

    const extraScrapeConfigs = `
- job_name: journal
  journal:
    path: /var/log/journal
    max_age: 12h
    labels:
      job: systemd-journal
  relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: 'unit'
      - source_labels: ['__journal__hostname']
        target_label: 'hostname'
`
    new k8s.helm.v3.Chart(
      `${name}-promtail`,
      {
        // https://github.com/grafana/helm-charts/tree/main/charts/promtail
        chart: 'promtail',
        repo: 'grafana',
        namespace: args.namespace,
        version: '3.8.2',
        values: {
          podAnnotations: {
            'prometheus.io/scrape': 'true',
            'prometheus.io/port': '3101',
          },
          config: {
            lokiAddress: `http://${name}-loki:3100/loki/api/v1/push`,
            snippets: {
              extraScrapeConfigs: extraScrapeConfigs,
              pipelineStages: [
                {
                  docker: {},
                },
                {
                  match: {
                    selector: '{app="eventrouter"}',
                    stages: [
                      {
                        json: {
                          expressions: {
                            namespace: 'event.metadata.namespace',
                          },
                        },
                      },
                      {
                        labels: {
                          namespace: '',
                        },
                      },
                    ],
                  },
                },
                {
                  match: {
                    selector: '{app="traefik"}|="/ping"',
                    action: 'drop',
                    drop_counter_reason: 'traefik_ping',
                  },
                },
                {
                  match: {
                    selector: '{app="traefik"}|="/metrics"',
                    action: 'drop',
                    drop_counter_reason: 'traefik_metrics',
                  },
                },
                {
                  match: {
                    selector: '{app="traefik"}|~"ClientHost"',
                    stages: [
                      {
                        json: {
                          expressions: {
                            ClientHost: 'ClientHost',
                            DownstreamStatus: 'DownstreamStatus',
                            Duration: 'Duration',
                            OriginContentSize: 'OriginContentSize',
                            RequestHost: 'RequestHost',
                            RequestMethod: 'RequestMethod',
                            RequestPath: 'RequestPath',
                            RequestProtocol: 'RequestProtocol',
                          },
                        },
                      },
                      {
                        labels: {
                          ClientHost: 'ClientHost',
                          DownstreamStatus: 'DownstreamStatus',
                          RequestHost: 'RequestHost',
                          RequestMethod: 'RequestMethod',
                        },
                      },
                      {
                        template: {
                          source: 'output_msg',
                          template:
                            '{{ .ClientHost }} - {{ .RequestMethod }} {{ .RequestPath }} {{ .RequestProtocol }} {{ .DownstreamStatus }} {{ .OriginContentSize }} {{ .Duration }}',
                        },
                      },
                      {
                        output: {
                          source: 'output_msg',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          //Ensure this pod is scheduled on every node
          priorityClassName: args.priorityClassName,
          resources: {
            limits: {
              cpu: '100m',
              memory: '128Mi',
            },
            requests: {
              cpu: '50m',
              memory: '128Mi',
            },
          },
          extraVolumes: [
            {
              name: 'journal',
              hostPath: {
                path: '/var/log/journal',
              },
            },
          ],
          extraVolumeMounts: [
            {
              name: 'journal',
              mountPath: '/var/log/journal',
              readOnly: true,
            },
          ],
        },
      },
      { ...opts }
    )
  }
}
