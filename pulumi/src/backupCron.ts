import * as k8s from '@pulumi/kubernetes'
import { StatefulService } from '.'

export const deployStsBackupCron = (asset: string, sts: StatefulService, namespace: string, provider: k8s.Provider) => {
  if (!sts.backup) return

  const name = `${asset}-volume-reaper`
  const serviceAccountName = createRbac(name, namespace, provider)
  const services = sts.services.map((svc) => svc.name).join(',')

  const container = {
    name,
    image: 'shapeshiftdao/unchained-volume-reaper:latest',
    args: ['-n', namespace, '-s', services, '-a', asset, '-c', `${sts.backup.count}`],
  }

  new k8s.batch.v1.CronJob(
    `${name}-job`,
    {
      metadata: {
        name: `${name}-job`,
        namespace: namespace,
        annotations: { 'pulumi.com/skipAwait': 'true' },
      },
      spec: {
        successfulJobsHistoryLimit: 1,
        failedJobsHistoryLimit: 1,
        concurrencyPolicy: 'Forbid',
        schedule: sts.backup.schedule,
        jobTemplate: {
          spec: {
            template: {
              spec: {
                serviceAccountName,
                containers: [container],
                restartPolicy: 'Never',
              },
            },
          },
        },
      },
    },
    { provider }
  )
}

const createRbac = (name: string, namespace: string, provider: k8s.Provider) => {
  const serviceAccountName = `${name}-sa`
  const roleName = `${name}-role`
  const roleBindingName = `${name}-role-binding`

  new k8s.core.v1.ServiceAccount(
    serviceAccountName,
    {
      metadata: {
        name: serviceAccountName,
        namespace: namespace,
      },
    },
    { provider }
  )

  new k8s.rbac.v1.Role(
    roleName,
    {
      metadata: {
        name: roleName,
        namespace: namespace,
      },
      rules: [
        {
          apiGroups: ['apps'],
          resources: ['*'],
          verbs: ['get', 'watch', 'list', 'update'],
        },
        {
          apiGroups: ['snapshot.storage.k8s.io'],
          resources: ['volumesnapshots'],
          verbs: ['get', 'watch', 'list', 'create', 'update', 'delete'],
        },
      ],
    },
    { provider }
  )

  new k8s.rbac.v1.RoleBinding(
    roleBindingName,
    {
      metadata: {
        name: roleBindingName,
        namespace: namespace,
      },
      roleRef: {
        kind: 'Role',
        name: roleName,
        apiGroup: '',
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: serviceAccountName,
          apiGroup: '',
        },
      ],
    },
    { provider }
  )

  return serviceAccountName
}
