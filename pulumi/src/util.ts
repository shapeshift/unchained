import { ServiceConfig } from "."

export const getPvcNames = (asset: string, replicas: number, services: ServiceConfig[]) => {
    return (Array.from(Array(replicas).keys()).flatMap(n => {
        return services.map(svc => `data-${svc.name}-${asset}-${n}`)
      }).filter((pvc) => pvc) as string[]).join(',')
  }