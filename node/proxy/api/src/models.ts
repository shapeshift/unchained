export interface ValidationResult {
  valid: boolean
}

export const services = [
  'bebop',
  'butterswap',
  'chainflip',
  'mayachain',
  'nearintents',
  'portals',
  'relay',
  'thorchain',
  'zrx',
] as const
export type Service = (typeof services)[number]

export interface DailyRevenue {
  totalUsd: number
  byService: Record<Service, number>
}

export interface AffiliateRevenueResponse {
  totalUsd: number
  byService: Record<Service, number>
  byDate: Record<string, DailyRevenue>
  failedProviders: Service[]
}
