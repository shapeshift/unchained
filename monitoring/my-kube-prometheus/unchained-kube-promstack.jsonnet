local addArgs = (import './utils.libsonnet').addArgs;

local kp =
  (import 'kube-prometheus/main.libsonnet') +
  (import 'kube-prometheus/addons/networkpolicies-disabled.libsonnet') +
  {
    values+:: {
      common+: {
        namespace: 'unchained-monitoring',
      },
      prometheus+:: {
        namespaces+: ['unchained', 'unchained-dev', 'unchained-infra'],
      },
    },
    kubeStateMetrics+:: {
      deployment+: {
        spec+: {
          template+: {
            spec+: {
              containers: addArgs(['--metric-labels-allowlist=pods=[*],nodes=[*]'], 'kube-state-metrics', super.containers),
            },
          },
        },
      },
    },
    prometheus+:: {
      prometheus+: {
        spec+: {  // https://github.com/coreos/prometheus-operator/blob/master/Documentation/api.md#prometheusspec
          // If a value isn't specified for 'retention', then by default the '--storage.tsdb.retention=24h' arg will be passed to prometheus by prometheus-operator.
          // The possible values for a prometheus <duration> are:
          //  * https://github.com/prometheus/common/blob/c7de230/model/time.go#L178 specifies "^([0-9]+)(y|w|d|h|m|s|ms)$" (years weeks days hours minutes seconds milliseconds)
          retention: '30d',

          // Reference info: https://github.com/coreos/prometheus-operator/blob/master/Documentation/user-guides/storage.md
          // By default (if the following 'storage.volumeClaimTemplate' isn't created), prometheus will be created with an EmptyDir for the 'prometheus-k8s-db' volume (for the prom tsdb).
          // This 'storage.volumeClaimTemplate' causes the following to be automatically created (via dynamic provisioning) for each prometheus pod:
          //  * PersistentVolumeClaim (and a corresponding PersistentVolume)
          //  * the actual volume (per the StorageClassName specified below)
          storage: {  // https://github.com/coreos/prometheus-operator/blob/master/Documentation/api.md#storagespec
            volumeClaimTemplate: {  // https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.11/#persistentvolumeclaim-v1-core (defines variable named 'spec' of type 'PersistentVolumeClaimSpec')
              apiVersion: 'v1',
              kind: 'PersistentVolumeClaim',
              spec: {
                accessModes: ['ReadWriteOnce'],
                // https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.11/#resourcerequirements-v1-core (defines 'requests'),
                // and https://kubernetes.io/docs/concepts/policy/resource-quotas/#storage-resource-quota (defines 'requests.storage')
                resources: { requests: { storage: '100Gi' } },
                // A StorageClass of the following name (which can be seen via `kubectl get storageclass` from a node in the given K8s cluster) must exist prior to kube-prometheus being deployed.
                storageClassName: 'ebs-csi-gp2',
                // The following 'selector' is only needed if you're using manual storage provisioning (https://github.com/coreos/prometheus-operator/blob/master/Documentation/user-guides/storage.md#manual-storage-provisioning).
                // And note that this is not supported/allowed by AWS - uncommenting the following 'selector' line (when deploying kube-prometheus to a K8s cluster in AWS) will cause the pvc to be stuck in the Pending status and have the following error:
                //  * 'Failed to provision volume with StorageClass "ssd": claim.Spec.Selector is not supported for dynamic provisioning on AWS'
                // selector: { matchLabels: {} },
              },
            },
          },  // storage
        },  // spec
      },  // prometheus
    },  // prometheus
  };

{ 'setup/0namespace-namespace': kp.kubePrometheus.namespace } +
{
  ['setup/prometheus-operator-' + name]: kp.prometheusOperator[name]
  for name in std.filter((function(name) name != 'serviceMonitor' && name != 'prometheusRule'), std.objectFields(kp.prometheusOperator))
} +
// { 'setup/pyrra-slo-CustomResourceDefinition': kp.pyrra.crd } +
// serviceMonitor and prometheusRule are separated so that they can be created after the CRDs are ready
{ 'prometheus-operator-serviceMonitor': kp.prometheusOperator.serviceMonitor } +
{ 'prometheus-operator-prometheusRule': kp.prometheusOperator.prometheusRule } +
{ 'kube-prometheus-prometheusRule': kp.kubePrometheus.prometheusRule } +
// { ['alertmanager-' + name]: kp.alertmanager[name] for name in std.objectFields(kp.alertmanager) } +
// { ['blackbox-exporter-' + name]: kp.blackboxExporter[name] for name in std.objectFields(kp.blackboxExporter) } +
{ ['grafana-' + name]: kp.grafana[name] for name in std.objectFields(kp.grafana) } +
// { ['pyrra-' + name]: kp.pyrra[name] for name in std.objectFields(kp.pyrra) if name != 'crd' } +
{ ['kube-state-metrics-' + name]: kp.kubeStateMetrics[name] for name in std.objectFields(kp.kubeStateMetrics) } +
{ ['kubernetes-' + name]: kp.kubernetesControlPlane[name] for name in std.objectFields(kp.kubernetesControlPlane) }
{ ['node-exporter-' + name]: kp.nodeExporter[name] for name in std.objectFields(kp.nodeExporter) } +
{ ['prometheus-' + name]: kp.prometheus[name] for name in std.objectFields(kp.prometheus) } +
{ ['prometheus-adapter-' + name]: kp.prometheusAdapter[name] for name in std.objectFields(kp.prometheusAdapter) }
