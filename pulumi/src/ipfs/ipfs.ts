import * as k8s from '@pulumi/kubernetes'
import { readFileSync } from 'fs'

interface IpfsClusterArgs {
  namespace: string
  provider: k8s.Provider
  domain: string
  additionalDomain?: string
}

export function deployIpfs({ namespace, provider, domain, additionalDomain }: IpfsClusterArgs) {
  const name = 'ipfs'
  const labels = { name, nodeType: 'cluster' }

  const secret = new k8s.core.v1.Secret(
    name,
    {
      metadata: { name, namespace },
      stringData: {
        ['cluster-secret']: process.env.IPFS_CLUSTER_SECRET as string,
        ['cluster-priv-key']: process.env.IPFS_CLUSTER_PRIV_KEY as string,
      },
    },
    { provider }
  )

  const cm = new k8s.core.v1.ConfigMap(
    `${name}-cm`,
    {
      metadata: {
        name: `${name}-cm`,
        namespace: namespace,
      },
      data: {
        ['cluster-id']: '12D3KooWHvJjQLVpjN4h7ySwcAYn5NLEcgtaSTwpNNaeBbsKacT4',
        ['entrypoint.sh']: readFileSync(`${__dirname}/entrypoint.sh`).toString(),
        ['configure-ipfs.sh']: readFileSync(`${__dirname}/configure-ipfs.sh`).toString(),
      },
    },
    { provider }
  )

  const podSpec: k8s.types.input.core.v1.PodTemplateSpec = {
    metadata: {
      namespace: namespace,
      labels: labels,
    },
    spec: {
      initContainers: [
        {
          name: 'configure-ipfs',
          image: 'ipfs/go-ipfs:latest',
          command: ['sh', '/custom/configure-ipfs.sh'],
          volumeMounts: [
            {
              name: 'ipfs-storage',
              mountPath: '/data/ipfs',
            },
            {
              name: 'configure-script',
              mountPath: '/custom',
            },
          ],
        },
      ],
      containers: [
        {
          name: 'ipfs',
          image: 'ipfs/go-ipfs:latest',
          env: [{ name: 'IPFS_FD_MAX', value: '8192' }],
          ports: [
            { name: 'swarm', containerPort: 4001, protocol: 'TCP' },
            { name: 'swarm-udp', containerPort: 4002, protocol: 'UDP' },
            { name: 'api', containerPort: 5001, protocol: 'TCP' },
            { name: 'ws', containerPort: 8081, protocol: 'TCP' },
            { name: 'http', containerPort: 8080, protocol: 'TCP' },
          ],
          livenessProbe: {
            tcpSocket: { port: 'swarm' },
            initialDelaySeconds: 30,
            timeoutSeconds: 5,
            periodSeconds: 15,
          },
          securityContext: { runAsUser: 0 },
          volumeMounts: [
            {
              name: 'ipfs-storage',
              mountPath: '/data/ipfs',
            },
            {
              name: 'configure-script',
              mountPath: '/custom',
            },
          ],
          resources: {
            limits: {
              cpu: '250m',
              memory: '512Mi',
            },
          },
        },
        {
          name: 'ipfs-cluster',
          image: 'ipfs/ipfs-cluster:latest',
          command: ['sh', '/custom/entrypoint.sh'],
          envFrom: [{ configMapRef: { name: cm.metadata.name } }],
          env: [
            {
              name: 'CLUSTER_ID',
              valueFrom: { configMapKeyRef: { name: cm.metadata.name, key: 'cluster-id' } },
            },
            {
              name: 'CLUSTER_PRIVATEKEY',
              valueFrom: { secretKeyRef: { name: secret.metadata.name, key: 'cluster-priv-key' } },
            },
            {
              name: 'CLUSTER_SECRET',
              valueFrom: { secretKeyRef: { name: secret.metadata.name, key: 'cluster-secret' } },
            },
            {
              name: 'CLUSTER_MONITOR_PING_INTERVAL',
              value: '3m',
            },
            {
              name: 'SVC_NAME',
              value: name,
            },
          ],
          ports: [
            { name: 'api-http', containerPort: 9094, protocol: 'TCP' },
            { name: 'proxy-http', containerPort: 9095, protocol: 'TCP' },
            { name: 'cluster-swarm', containerPort: 9096, protocol: 'TCP' },
          ],
          livenessProbe: {
            tcpSocket: { port: 'cluster-swarm' },
            initialDelaySeconds: 5,
            timeoutSeconds: 5,
            periodSeconds: 10,
          },
          securityContext: { runAsUser: 0 },
          volumeMounts: [
            {
              name: 'cluster-storage',
              mountPath: '/data/ipfs-cluster',
            },
            {
              name: 'configure-script',
              mountPath: '/custom',
            },
          ],
          resources: {
            limits: {
              cpu: '100m',
              memory: '128Mi',
            },
          },
        },
      ],
      volumes: [
        {
          name: 'configure-script',
          configMap: {
            name: cm.metadata.name,
            defaultMode: 0o755,
          },
        },
      ],
    },
  }

  new k8s.apps.v1.StatefulSet(
    name,
    {
      metadata: {
        name,
        namespace: namespace,
        annotations: { 'pulumi.com/skipAwait': 'true' },
      },
      spec: {
        selector: { matchLabels: labels },
        serviceName: `${name}-svc`,
        replicas: 3,
        podManagementPolicy: 'Parallel',
        updateStrategy: {
          type: 'RollingUpdate',
        },
        template: podSpec,
        volumeClaimTemplates: [
          {
            metadata: {
              name: 'cluster-storage',
              annotations: {
                'ebs.csi.aws.com/iops': '3000',
                'ebs.csi.aws.com/throughput': '125',
              },
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'gp3',
              resources: {
                requests: { storage: '5Gi' },
              },
            },
          },
          {
            metadata: {
              name: 'ipfs-storage',
              annotations: {
                'ebs.csi.aws.com/iops': '3000',
                'ebs.csi.aws.com/throughput': '125',
              },
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'gp3',
              resources: {
                requests: { storage: '200Gi' },
              },
            },
          },
        ],
      },
    },
    { provider }
  )

  const svc = new k8s.core.v1.Service(
    `${name}-svc`,
    {
      metadata: {
        name: `${name}-svc`,
        namespace: namespace,
        labels: labels,
      },
      spec: {
        ports: [
          { port: 4001, name: 'swarm' },
          { port: 4002, name: 'swarm-udp' },
          { port: 8081, name: 'ws' },
          { port: 8080, name: 'http' },
          { port: 9094, name: 'api-http' },
          { port: 9095, name: 'proxy-http' },
          { port: 9096, name: 'cluster-swarm' },
        ],
        selector: labels,
        type: 'ClusterIP',
      },
    },
    { provider, deleteBeforeReplace: true }
  )

  const secretName = `${name}-cert-secret`

  new k8s.apiextensions.CustomResource(
    `${name}-cert`,
    {
      apiVersion: 'cert-manager.io/v1',
      kind: 'Certificate',
      metadata: {
        namespace,
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
        dnsNames: [`gateway.${domain}`],
        issuerRef: {
          name: 'lets-encrypt',
          kind: 'ClusterIssuer',
          group: 'cert-manager.io',
        },
      },
    },
    { provider }
  )

  const domains = additionalDomain
    ? `Host(\`gateway.${domain}\`) || Host(\`gateway.${additionalDomain}\`)`
    : `Host(\`gateway.${domain}\`)`

  new k8s.apiextensions.CustomResource(
    `${name}-ingressroute`,
    {
      apiVersion: 'traefik.containo.us/v1alpha1',
      kind: 'IngressRoute',
      metadata: {
        namespace,
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
                name: svc.metadata.name,
                port: 8080,
                namespace,
              },
            ],
          },
        ],
        tls: {
          secretName: secretName,
          domains: [{ main: `gateway.${domain}` }],
        },
      },
    },
    { provider }
  )

  new k8s.networking.v1.Ingress(
    `${name}-ingress`,
    {
      metadata: {
        namespace,
      },
      spec: {
        rules: [{ host: `gateway.${domain}` }],
      },
    },
    { provider }
  )
}
