import axios from 'axios'
import * as bebop from './bebop'
import * as butterswap from './butterswap'
import { affiliateRevenueCache } from './cache'
import * as chainflip from './chainflip'
import * as mayachain from './mayachain'
import * as nearintents from './nearIntents'
import * as portals from './portals'
import * as relay from './relay'
import * as thorchain from './thorchain'
import * as zrx from './zrx'
import { AffiliateRevenueResponse, Service, services } from '../models'

const providerNames: Service[] = [
  'bebop',
  'butterswap',
  'chainflip',
  'mayachain',
  'nearintents',
  'portals',
  'relay',
  'thorchain',
  'zrx',
]

const formatError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 'no response'
    const data = error.response?.data
    const message = typeof data === 'object' ? JSON.stringify(data) : data ?? error.message
    return `HTTP ${status}: ${message}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export type Fees = {
  amount: string
  amountUsd?: string
  assetId: string
  chainId: string
  service: Service
  timestamp: number
  txHash: string
}

export class AffiliateRevenue {
  async getAffiliateRevenue(startTimestamp: number, endTimestamp: number): Promise<AffiliateRevenueResponse> {
    if (affiliateRevenueCache.isInitialized()) {
      return await affiliateRevenueCache.getRevenue(startTimestamp, endTimestamp)
    }

    const fees: Array<Fees> = []
    const failedProviders: Service[] = []

    const results = await Promise.allSettled([
      bebop.getFees(startTimestamp, endTimestamp),
      butterswap.getFees(startTimestamp, endTimestamp),
      chainflip.getFees(startTimestamp, endTimestamp),
      mayachain.getFees(startTimestamp, endTimestamp),
      nearintents.getFees(startTimestamp, endTimestamp),
      portals.getFees(startTimestamp, endTimestamp),
      relay.getFees(startTimestamp, endTimestamp),
      thorchain.getFees(startTimestamp, endTimestamp),
      zrx.getFees(startTimestamp, endTimestamp),
    ])

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        fees.push(...result.value)
      } else {
        const provider = providerNames[index]
        failedProviders.push(provider)
        console.error(`[AffiliateRevenue] ${provider} failed: ${formatError(result.reason)}`)
      }
    })

    const byService: Record<Service, number> = {} as Record<Service, number>

    for (const service of services) {
      byService[service] = 0
    }

    for (const revenue of fees) {
      byService[revenue.service] = (byService[revenue.service] || 0) + parseFloat(revenue.amountUsd || '0')
    }

    const totalUsd = fees.reduce((sum, rev) => sum + parseFloat(rev.amountUsd || '0'), 0)

    return {
      totalUsd,
      byService,
      failedProviders,
    }
  }
}
