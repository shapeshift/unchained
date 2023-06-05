import * as k8s from '@pulumi/kubernetes'
import * as pulumi from '@pulumi/pulumi'

export interface deploymentArgs {
  namespace: pulumi.Input<string>
  domain: string
  additionalDomain?: string
}

export class Ingress extends pulumi.ComponentResource {
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
          dnsNames: [`monitoring.${args.domain}`],
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
      ? `Host(\`monitoring.${args.domain}\`) || Host(\`monitoring.${args.additionalDomain}\`)`
      : `Host(\`monitoring.${args.domain}\`)`

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
              match: domains,
              kind: 'Rule',
              services: [
                {
                  kind: 'Service',
                  name: `grafana`,
                  port: 3000,
                  namespace: `${name}-monitoring`,
                },
              ],
            },
          ],
          tls: {
            secretName: secretName,
            domains: [{ main: `monitoring.${args.domain}` }],
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
          rules: [{ host: `monitoring.${args.domain}` }],
        },
      },
      { ...opts }
    )
  }
}
