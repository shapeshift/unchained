import * as k8s from '@pulumi/kubernetes'
import { getConfig } from './config'
import * as grafana from './grafana'
import { readFileSync } from 'fs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const { kubeconfig, domain, additionalDomain } = await getConfig()

  const name = 'unchained'
  const namespace = `${name}-monitoring`
  const outputs: Outputs = {}
  const provider = new k8s.Provider('kube-provider', { kubeconfig })

  // https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack
  new k8s.helm.v3.Release(
    name,
    {
      name,
      chart: 'kube-prometheus-stack',
      version: '48.3.1',
      repositoryOpts: {
        repo: 'https://prometheus-community.github.io/helm-charts',
      },
      namespace,
      values: {
        kubeControllerManager: { enabled: false },
        kubeEtcd: { enabled: false },
        kubeScheduler: { enabled: false },
        prometheus: {
          prometheusSpec: {
            serviceMonitorSelectorNilUsesHelmValues: false,
            retention: '60d',
            storageSpec: {
              volumeClaimTemplate: {
                spec: {
                  storageClassName: 'gp3',
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '500Gi' } },
                },
              },
            },
          },
        },
        grafana: {
          adminPassword: process.env.GRAFANA_ADMIN_PASSWORD ?? 'unchained',
          deploymentStrategy: { type: 'Recreate' },
          persistence: { enabled: true, size: '10Gi', storageClassName: 'gp3' },
          dashboardProviders: {
            'dashboardProviders.yaml': {
              apiVersion: 1,
              providers: [
                {
                  name: 'default',
                  orgId: 1,
                  folder: '',
                  type: 'file',
                  disableDeletion: true,
                  editable: false,
                  options: {
                    path: '/var/lib/grafana/dashboards/default',
                  },
                },
              ],
            },
          },
          dashboards: {
            default: {
              overview: { json: readFileSync('./dashboards/overview.json').toString() },
            },
          },
          'grafana.ini': {
            server: { root_url: `https://monitoring.${additionalDomain ?? domain}` },
            'auth.github': {
              enabled: true,
              allow_sign_up: true,
              scopes: 'user:email,read:org',
              auth_url: 'https://github.com/login/oauth/authorize',
              token_url: 'https://github.com/login/oauth/access_token',
              api_url: 'https://api.github.com/user',
              allowed_organizations: process.env.GITHUB_ORG,
              client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
              client_secret: process.env.GITHUB_OAUTH_SECRET,
            },
          },
        },
        alertmanager: {
          alertmanagerSpec: {
            storage: {
              volumeClaimTemplate: {
                spec: {
                  storageClassName: 'gp3',
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '50Gi' } },
                },
              },
            },
          },
          stringConfig: readFileSync('./alertmanager/config.yaml')
            .toString()
            .replace('<<DISCORD_WEBHOOK_URL_CRITICAL>>', process.env.DISCORD_WEBHOOK_URL_CRITICAL ?? '')
            .replace('<<DISCORD_WEBHOOK_URL_WARNING>>', process.env.DISCORD_WEBHOOK_URL_WARNING ?? '')
            .replace('<<DISCORD_WEBHOOK_URL_DEV>>', process.env.DISCORD_WEBHOOK_URL_DEV ?? ''),
          tplConfig: true,
          templateFiles: {
            'discord.tmpl': readFileSync('./alertmanager/discord.tmpl').toString(),
          },
        },
        additionalPrometheusRulesMap: {
          unchained: JSON.parse(readFileSync('./alertmanager/rules.json').toString()),
        },
        'kube-state-metrics': {
          metricLabelsAllowlist: ['pods=[*],deployments=[*],statefulsets=[*]'],
        },
      },
    },
    { provider }
  )

  new grafana.Ingress(
    name,
    {
      namespace: namespace,
      domain: domain,
      additionalDomain: additionalDomain,
    },
    { provider }
  )

  return outputs
}
