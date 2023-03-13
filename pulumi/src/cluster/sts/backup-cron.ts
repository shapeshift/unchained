import { ServiceConfig, StsDefinition } from "../..";
import * as k8s from '@pulumi/kubernetes'

export const deployStsBackupCron = (asset: string, sts: StsDefinition, namespace: string, provider: k8s.Provider) => {    
    const backupContainer = createBackupContainer(asset, namespace, sts)
    const serviceAccountName = createRbac(asset, namespace, provider)

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
        schedule: sts.backupSchedule!!,
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

const createBackupContainer = (asset: string, namespace: string, sts: StsDefinition): k8s.types.input.core.v1.Container => {
  const pvcList = getPvcNames(asset, sts.replicas, sts.services)
  return {
    name: `${asset}-backup-runner`,
    image: 'lukmyslinski/backuprunner:0.16',
    args: ['-n', namespace, '-s', `${asset}-sts`, '-p', pvcList, '-r', `${sts.replicas}`, "-c", `${sts.backupCount}`],
  }
}

const getPvcNames = (asset: string, replicas: number, services: ServiceConfig[]) => {
  return (Array.from(Array(replicas).keys()).flatMap(n => {
      return services.map(svc => `data-${svc.name}-${asset}-sts-${n}`)
    }).filter((pvc) => pvc) as string[]).join(',')
}


const createRbac = (asset: string, namespace: string, provider: k8s.Provider) => {
  const serviceAccountName = `${asset}-backup-job-sa`;

  new k8s.core.v1.ServiceAccount(serviceAccountName, {
    metadata: {
      name: serviceAccountName,
      namespace: namespace
    }
  }, { provider });

  new k8s.rbac.v1.Role(`${asset}-backup-job-role`, {
    metadata: {
      name: `${asset}-backup-job-role`,
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
      name: `${asset}-backup-job-role`,
      namespace: namespace
    },
    roleRef: {
      kind: "Role",
      name: `${asset}-backup-job-role`,
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