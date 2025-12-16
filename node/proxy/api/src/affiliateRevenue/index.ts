import * as zrx from './zrx'
import * as bebop from './bebop'
import * as thorchain from './thorchain'
import * as mayachain from './mayachain'
import * as chainflip from './chainflip'
import * as portals from './portals'
import { AffiliateRevenueResponse, Service, services } from '../models'

const providerNames: Service[] = ['zrx', 'bebop', 'thorchain', 'mayachain', 'chainflip', 'portals']

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
    const fees: Array<Fees> = []
    const failedProviders: Service[] = []

    const results = await Promise.allSettled([
      zrx.getFees(startTimestamp, endTimestamp),
      bebop.getFees(startTimestamp, endTimestamp),
      thorchain.getFees(startTimestamp, endTimestamp),
      mayachain.getFees(startTimestamp, endTimestamp),
      chainflip.getFees(startTimestamp, endTimestamp),
      portals.getFees(startTimestamp, endTimestamp),
    ])

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        fees.push(...result.value)
      } else {
        const provider = providerNames[index]
        failedProviders.push(provider)
        console.error(`[AffiliateRevenue] ${provider} failed:`, result.reason)
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
