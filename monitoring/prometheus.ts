import * as k8s from '@pulumi/kubernetes'
import * as pulumi from '@pulumi/pulumi'

export interface deploymentArgs {
  namespace: pulumi.Input<string>
  priorityClassName: pulumi.Output<string>
  alerting: boolean
  opsgenieApiKey: string
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
          // Config files
          //If alerting is true, provide OpsGenie integration configuration
          alertmanagerFiles: args.alerting
            ? {
                'alertmanager.yml': {
                  receivers: [
                    {
                      name: 'opsgenie',
                      opsgenie_configs: [
                        {
                          api_key: args.opsgenieApiKey,
                          responders: [
                            {
                              type: 'team',
                              name: 'Unchained',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                  route: {
                    receiver: 'opsgenie',
                  },
                },
              }
            : {},
          serverFiles: {
            'alerting_rules.yml': {
              groups: [
                {
                  name: 'prometheus',
                  rules: [
                    {
                      alert: 'PrometheusJobMissing',
                      expr: 'absent(up{job="prometheus"})',
                      for: '0m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'Prometheus job missing (instance {{$labels.instance }}',
                        description: 'A Prometheus job has disappeared VALUE = {{ $value }}',
                      },
                    },
                    {
                      alert: 'PrometheusTargetMissing',
                      expr: 'up == 0',
                      for: '0m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'Prometheus target missing (instance {{$labels.instance }}',
                        description:
                          'A Prometheus target has disappeared VALUE = {{ $value }} -- LABELS = {{ $labels }}',
                      },
                    },
                  ],
                },
                {
                  name: 'kubernetes',
                  rules: [
                    {
                      alert: 'KubernetesNodeReady',
                      expr: 'kube_node_status_condition{condition="Ready",status="true"} == 0',
                      for: '10m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'Kubernetes Node ready (instance {{ $labels.instance}})',
                        description:
                          '"Node {{ $labels.node }} has been unready for a long time VALUE = {{ $value }} LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesMemoryPressure',
                      expr: 'kube_node_status_condition{condition="MemoryPressure",status="true"} == 1',
                      for: '2m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'Kubernetes memory pressure (instance {{ $labels.instance }})',
                        description:
                          '"{{ $labels.node }} has MemoryPressure condition\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesDiskPressure',
                      expr: 'kube_node_status_condition{condition="DiskPressure",status="true"} == 1',
                      for: '2m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'Kubernetes disk pressure (instance {{ $labels.instance }})',
                        description:
                          '"{{ $labels.node }} has DiskPressure condition\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesOutOfCapacity',
                      expr:
                        'sum by (node) ((kube_pod_status_phase{phase="Running"} == 1) + on(uid) group_left(node) (0 * kube_pod_info{pod_template_hash=""})) / sum by (node) (kube_node_status_allocatable{resource="pods"}) * 100 > 90',
                      for: '2m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'Kubernetes out of capacity (instance {{ $labels.instance }})',
                        description:
                          '"{{ $labels.node }} is out of capacity\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesContainerOomKiller',
                      expr:
                        '(kube_pod_container_status_restarts_total - kube_pod_container_status_restarts_total offset 10m >= 1) and ignoring (reason) min_over_time(kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}[10m]) == 1',
                      for: '0m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'Kubernetes container oom killer (pod {{ $labels.pod }})',
                        description:
                          '"Container {{ $labels.container }} in pod {{ $labels.namespace }}/{{ $labels.pod }} has been OOMKilled {{ $value }} times in the last 10 minutes.\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesVolumeOutOfDiskSpace',
                      expr: 'kubelet_volume_stats_available_bytes / kubelet_volume_stats_capacity_bytes * 100 < 10',
                      for: '2m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'Kubernetes Volume out of disk space (instance {{ $labels.instance }})',
                        description:
                          '"Volume is almost full (< 10% left)\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesPersistentvolumeclaimPending',
                      expr: 'kube_persistentvolumeclaim_status_phase{phase="Pending"} == 1',
                      for: '2m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'Kubernetes PersistentVolumeClaim pending (instance {{ $labels.instance }})',
                        description:
                          '"PersistentVolumeClaim {{ $labels.namespace }}/{{ $labels.persistentvolumeclaim }} is pending\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesPersistentvolumeError',
                      expr: 'kube_persistentvolume_status_phase{phase=~"Failed|Pending", job="kube-state-metrics"} > 0',
                      for: '0m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'Kubernetes PersistentVolume error (instance {{ $labels.instance }})',
                        description:
                          '"Persistent volume is in bad state\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesStatefulsetDown',
                      expr: '(kube_statefulset_status_replicas_ready / kube_statefulset_status_replicas_current) != 1',
                      for: '2m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'Kubernetes StatefulSet down (statefulset {{ $labels.statefulset }})',
                        description: '"A StatefulSet went down\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesReplicassetMismatch',
                      expr: 'kube_replicaset_spec_replicas != kube_replicaset_status_ready_replicas',
                      for: '10m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'Kubernetes ReplicasSet mismatch (replicaset {{ $labels.replicaset }})',
                        description: '"Deployment Replicas mismatch\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesPodNotHealthy',
                      expr:
                        'min_over_time(sum by (namespace, pod) (kube_pod_status_phase{phase=~"Pending|Unknown|Failed"})[15m:1m]) > 0',
                      for: '0m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'Kubernetes Pod not healthy (pod {{ $labels.pod }})',
                        description:
                          '"Pod has been in a non-ready state for longer than 15 minutes.\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesPodCrashLooping',
                      expr: 'increase(kube_pod_container_status_restarts_total[1m]) > 3',
                      for: '2m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'Kubernetes pod crash looping (pod {{ $labels.pod }})',
                        description:
                          '"Pod {{ $labels.pod }} is crash looping\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesDaemonsetRolloutStuck',
                      expr:
                        'kube_daemonset_status_number_ready / kube_daemonset_status_desired_number_scheduled * 100 < 100 or kube_daemonset_status_desired_number_scheduled - kube_daemonset_status_current_number_scheduled > 0',
                      for: '10m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'Kubernetes DaemonSet rollout stuck (daemonset {{ $labels.daemonset }})',
                        description:
                          '"Some Pods of DaemonSet are not scheduled or not ready\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesApiServerErrors',
                      expr:
                        'sum(rate(apiserver_request_total{job="apiserver",code=~"^(?:5..)$"}[1m])) / sum(rate(apiserver_request_total{job="apiserver"}[1m])) * 100 > 3',
                      for: '2m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'Kubernetes API server errors (instance {{ $labels.instance }})',
                        description:
                          '"Kubernetes API server is experiencing high error rate\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesApiClientErrors',
                      expr:
                        '(sum(rate(rest_client_requests_total{code=~"(4|5).."}[1m])) by (instance, job) / sum(rate(rest_client_requests_total[1m])) by (instance, job)) * 100 > 1',
                      for: '2m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'Kubernetes API client errors (instance {{ $labels.instance }})',
                        description:
                          '"Kubernetes API client is experiencing high error rate\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'KubernetesApiServerLatency',
                      expr:
                        'histogram_quantile(0.99, sum(rate(apiserver_request_latencies_bucket{subresource!="log",verb!~"^(?:CONNECT|WATCHLIST|WATCH|PROXY)$"} [10m])) WITHOUT (instance, resource)) / 1e+06 > 1',
                      for: '2m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'Kubernetes API server latency (instance {{ $labels.instance }})',
                        description:
                          '"Kubernetes API server has a 99th percentile latency of {{ $value }} seconds for {{ $labels.verb }} {{ $labels.resource }}.\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                  ],
                },
                {
                  name: 'mongo',
                  rules: [
                    {
                      alert: 'MongodbDown',
                      expr:
                        'mongodb_up == 0',
                      for: '5m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'MongoDB Down (instance {{ $labels.app_kubernetes_io_instance }})',
                        description:
                          '"MongoDB instance is down\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'MongodbReplicationLag',
                      expr:
                        'mongodb_mongod_replset_member_optime_date{state="PRIMARY"} - ON (app_kubernetes_io_instance, set) group_right mongodb_mongod_replset_member_optime_date{state="SECONDARY"} > 10',
                      for: '0m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'MongoDB replication lag (instance {{ $labels.app_kubernetes_io_instance }})',
                        description:
                          '"Mongodb replication lag is more than 10s\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'MongodbReplicationHeadroom',
                      expr:
                        '(avg(mongodb_mongod_replset_oplog_head_timestamp - mongodb_mongod_replset_oplog_tail_timestamp) by (app_kubernetes_io_instance) - (avg(mongodb_mongod_replset_member_optime_date{state="PRIMARY"}) by (app_kubernetes_io_instance) - avg(mongodb_mongod_replset_member_optime_date{state="SECONDARY"}) by (app_kubernetes_io_instance))) <= 0',
                      for: '0m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'MongoDB replication headroom (instance {{ $labels.app_kubernetes_io_instance }})',
                        description:
                          '"Mongodb replication headroom is <= 0\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'MongodbNumberCursorsOpen',
                      expr:
                        'mongodb_mongod_metrics_cursor_open{state="total"} > 500',
                      for: '2m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'MongoDB number cursors open (instance {{ $labels.app_kubernetes_io_instance }})',
                        description:
                          '"Too many cursors opened by MongoDB for clients (> 500)\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'MongodbCursorTimeouts',
                      expr:
                        'increase(mongodb_mongod_metrics_cursor_timed_out_total[1m]) > 50',
                      for: '2m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'MongoDB cursor timeouts (instance {{ $labels.app_kubernetes_io_instance }})',
                        description:
                          '"Too many cursor timeouts (>50)\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'MongodbTooManyConnections',
                      expr:
                        'mongodb_connections{state="current"} > 5000',
                      for: '2m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'MongoDB too many connections (instance {{ $labels.app_kubernetes_io_instance }})',
                        description:
                          '"Too many connections (> 5000)\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                  ]
                },
                {
                  name: 'rabbitmq',
                  rules: [
                    {
                      alert: 'RabbitMQDown',
                      expr:
                        'rabbitmq_up == 0',
                      for: '5m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'RabbitMQ node down (instance {{ $labels.release }})',
                        description:
                          '"RabbitMQ node down\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'RabbitMQHighMemory',
                      expr:
                        'rabbitmq_node_mem_used / rabbitmq_node_mem_limit * 100 > 70',
                      for: '0m',
                      labels: {
                        severity: 'critical',
                      },
                      annotations: {
                        summary: 'RabbitMQ High Memory (instance {{ $labels.release }})',
                        description:
                          '"RabbitMQ memory usage exceeds 70%\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'RabbitMQTooManyConnections',
                      expr:
                        'rabbitmq_connectionsTotal > 1000',
                      for: '2m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'RabbitMQ too many connections(instance {{ $labels.release }})',
                        description:
                          '"RabbitMQ instance has too many connections (> 1000)\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                    {
                      alert: 'RabbitMQDeadLetterQueueFillingUp',
                      expr:
                        'rabbitmq_queue_messages{queue=~".*deadLetter"} > 10000',
                      for: '5m',
                      labels: {
                        severity: 'warning',
                      },
                      annotations: {
                        summary: 'RabbitMQ dead letter queue filling up (instance {{ $labels.release }}, queue {{ $labels.queue }})',
                        description:
                          '"Dead letter queue is filling up (> 10000 messages)\n  VALUE = {{ $value }}\n  LABELS = {{ $labels }}"',
                      },
                    },
                  ]
                }
              ],
            },
          },
          // Service configuration
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
