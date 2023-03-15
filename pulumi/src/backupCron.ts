import { StatefulService } from ".";
import * as k8s from '@pulumi/kubernetes'

export const deployStsBackupCron = (asset: string, sts: StatefulService, namespace: string, provider: k8s.Provider) => {    
  if (!sts.backup) return

  const serviceAccountName = createRbac(asset, namespace, provider)

  const pvcs = Array.from(Array(sts.replicas).keys())
    .flatMap((n) => sts.services.map((svc) => `data-${svc.name}-${asset}-sts-${n}`))
    .join(',')

  const backupContainer = {
    name: `${asset}-backup-runner`,
    image: 'shapeshift/volumereaper:0.24',
    args: ['-n', namespace, '-s', `${asset}-sts`, '-p', pvcs, "-c", `${sts.backup.backupCount}`],
  }

  new k8s.batch.v1.CronJob(`${asset}-backup-job`, {
    metadata: {
      name: `${asset}-backup-job`,
      namespace: namespace,
      annotations: { 'pulumi.com/skipAwait': 'true' },
    },
    spec: {
      successfulJobsHistoryLimit: 1,
      failedJobsHistoryLimit: 1,
      concurrencyPolicy: "Forbid",
      schedule: sts.backup.schedule,
      jobTemplate: {
        spec: {
          template: {
            spec: {
              serviceAccountName: serviceAccountName,
              containers: [backupContainer],
              restartPolicy: "Never"
            },
          },
        },
      },
    },
  }, { provider })
}

const createRbac = (asset: string, namespace: string, provider: k8s.Provider) => {
  const serviceAccountName = `${asset}-backup-job-sa`;
  const backupJobRole = `${asset}-backup-job-role`

  new k8s.core.v1.ServiceAccount(serviceAccountName, {
    metadata: {
      name: serviceAccountName,
      namespace: namespace
    }
  }, { provider });

  new k8s.rbac.v1.Role(backupJobRole, {
    metadata: {
      name: backupJobRole,
      namespace: namespace
    },
    rules: [
      {
        apiGroups: ["apps"],
        resources: ["*"],
        verbs: ["get", "watch", "list", "update"],
      },
      {
        apiGroups: ["snapshot.storage.k8s.io"],
        resources: ["volumesnapshots"],
        verbs: ["get", "watch", "list", "create", "update", "delete"],
      }
    ]
  }, { provider });

  new k8s.rbac.v1.RoleBinding(`${asset}-backup-job-role-binding`, {
    metadata: {
      name: backupJobRole,
      namespace: namespace
    },
    roleRef: {
      kind: "Role",
      name: backupJobRole,
      apiGroup: ""
    },
    subjects: [
      {
        kind: "ServiceAccount",
        name: serviceAccountName,
        apiGroup: ""
      }
    ]
  }, {provider})
  return serviceAccountName;
}