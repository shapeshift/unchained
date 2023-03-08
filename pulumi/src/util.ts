import { ServiceConfig } from "."

export const getPvcNames = (replicas: number, services: ServiceConfig[]) => {
    return (Array.from(Array(replicas).keys()).flatMap(n => {
        return services.map(svc => `data-${svc.name}-${n}`)
      }).filter((pvc) => pvc) as string[]).join(',')
  }