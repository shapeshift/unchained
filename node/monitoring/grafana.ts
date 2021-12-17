import * as k8s from '@pulumi/kubernetes'
import * as pulumi from '@pulumi/pulumi'

export interface deploymentArgs {
  namespace: pulumi.Input<string>
  domain: string
  githubOrg: string
  githubOauthID: string
  githubOauthSecret: string
}

export class Deployment extends pulumi.ComponentResource {
  constructor(name: string, args: deploymentArgs, opts?: pulumi.ComponentResourceOptions) {
    super('grafana', name, {}, opts)

    const secretName = 'grafana-cert-secret'

    new k8s.apiextensions.CustomResource(
      `${name}-grafana-cert`,
      {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Certificate',
        metadata: {
          namespace: args.namespace,
        },
        spec: {
          secretName: secretName,
          duration: '2160h',
          renewBefore: '360h',
          isCA: false,
          privateKey: {
            algorithm: 'RSA',
            encoding: 'PKCS1',
            size: 2048,
          },
          dnsNames: [`grafana.${args.domain}`],
          issuerRef: {
            name: 'lets-encrypt',
            kind: 'ClusterIssuer',
            group: 'cert-manager.io',
          },
        },
      },
      { ...opts }
    )

    new k8s.apiextensions.CustomResource(
      `${name}-grafana-ingressroute`,
      {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'IngressRoute',
        metadata: {
          namespace: args.namespace,
        },
        spec: {
          entryPoints: ['web', 'websecure'],
          routes: [
            {
              match: `Host(\`grafana.${args.domain}\`)`,
              kind: 'Rule',
              services: [
                {
                  kind: 'Service',
                  name: `${name}-grafana`,
                  port: 80,
                  namespace: `${name}-monitoring`,
                },
              ],
            },
          ],
          tls: {
            secretName: secretName,
            domains: [{ main: `grafana.${args.domain}` }],
          },
        },
      },
      { ...opts }
    )

    new k8s.networking.v1.Ingress(
      `${name}-grafana-ingress`,
      {
        metadata: {
          namespace: args.namespace,
        },
        spec: {
          rules: [{ host: `grafana.${args.domain}` }],
        },
      },
      { ...opts }
    )

    new k8s.helm.v3.Chart(
      `${name}-grafana`,
      {
        // https://github.com/grafana/helm-charts/tree/main/charts/grafana
        chart: 'grafana',
        repo: 'grafana',
        namespace: args.namespace,
        version: '6.17.6',
        values: {
          datasources: {
            'datasources.yaml': {
              apiVersion: 1,
              datasources: [
                {
                  name: 'Loki',
                  type: 'loki',
                  url: `http://${name}-loki:3100`,
                  access: 'proxy',
                },
                {
                  name: 'Prometheus',
                  type: 'prometheus',
                  url: `http://${name}-prometheus-server:80`,
                  access: 'proxy',
                },
              ],
            },
          },
          'grafana.ini': {
            'auth.github': {
              enabled: true,
              allow_sign_up: true,
              scopes: 'user:email,read:org',
              auth_url: 'https://github.com/login/oauth/authorize',
              token_url: 'https://github.com/login/oauth/access_token',
              api_url: 'https://api.github.com/user',
              allowed_organizations: args.githubOrg,
              client_id: args.githubOauthID,
              client_secret: args.githubOauthSecret,
            },
            server: {
              root_url: `https://grafana.${args.domain}`,
            },
          },
          persistence: {
            type: 'statefulset',
            enabled: true,
            size: '5Gi',
          },
          resources: {
            limits: {
              cpu: '500m',
              memory: '1Gi',
            },
            requests: {
              cpu: '500m',
              memory: '1Gi',
            },
          },
        },
      },
      { ...opts }
    )
  }
}
