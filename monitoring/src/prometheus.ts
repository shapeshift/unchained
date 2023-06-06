import * as k8s from '@pulumi/kubernetes'
import * as pulumi from '@pulumi/pulumi'

export interface deploymentArgs {
  namespace: pulumi.Input<string>
  domain: string
  additionalDomain?: string
  prometheusCreds: string
}

export class Ingress extends pulumi.ComponentResource {
  constructor(name: string, args: deploymentArgs, opts?: pulumi.ComponentResourceOptions) {
    super('prometheus', name, {}, opts)

    const secretName = 'prometheus-cert-secret'

    new k8s.core.v1.Secret(
      `${name}-prometheus-auth-secret`,
      {
        metadata: {
          name: `${name}-prometheus-auth-secret`,
          namespace: args.namespace,
        },
        stringData: {
          users: args.prometheusCreds,
        },
      },
      { ...opts }
    )

    new k8s.apiextensions.CustomResource(
      `${name}-prometheus-cert`,
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
          dnsNames: [`prometheus.${args.domain}`],
          issuerRef: {
            name: 'lets-encrypt',
            kind: 'ClusterIssuer',
            group: 'cert-manager.io',
          },
        },
      },
      { ...opts }
    )

    const domains = args.additionalDomain
      ? `Host(\`prometheus.${args.domain}\`) || Host(\`prometheus.${args.additionalDomain}\`)`
      : `Host(\`prometheus.${args.domain}\`)`

    new k8s.apiextensions.CustomResource(
      `${name}-prometheus-ingress-auth`,
      {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'Middleware',
        metadata: {
          name: `${name}-prometheus-ingress-auth`,
          namespace: args.namespace,
        },
        spec: {
          basicAuth: {
            secret: `${name}-prometheus-auth-secret`,
            removeHeader: true,
          },
        },
      },
      { ...opts }
    )

    new k8s.apiextensions.CustomResource(
      `${name}-prometheus-ingressroute`,
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
              match: domains,
              kind: 'Rule',
              middlewares: [
                {
                  name: `${name}-prometheus-ingress-auth`,
                  namespace: args.namespace,
                },
              ],
              services: [
                {
                  kind: 'Service',
                  name: `prometheus-k8s`,
                  port: 9090,
                  namespace: `${name}-monitoring`,
                },
              ],
            },
          ],
          tls: {
            secretName: secretName,
            domains: [{ main: `prometheus.${args.domain}` }],
          },
        },
      },
      { ...opts }
    )

    new k8s.networking.v1.Ingress(
      `${name}-prometheus-ingress`,
      {
        metadata: {
          namespace: args.namespace,
        },
        spec: {
          rules: [{ host: `prometheus.${args.domain}` }],
        },
      },
      { ...opts }
    )
  }
}
