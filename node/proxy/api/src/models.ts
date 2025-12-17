export interface ValidationResult {
  valid: boolean
}

export const services = ['bebop', 'chainflip', 'mayachain', 'nearintents', 'portals', 'thorchain', 'zrx'] as const
export type Service = (typeof services)[number]

export interface AffiliateRevenueResponse {
  byService: Record<Service, number>
  failedProviders: Service[]
  totalUsd: number
}
