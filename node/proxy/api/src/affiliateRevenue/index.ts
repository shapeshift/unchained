import * as zrx from './zrx'
import * as bebop from './bebop'
import * as thorchain from './thorchain'
import * as mayachain from './mayachain'
import * as chainflip from './chainflip'
import * as portals from './portals'
import { AffiliateRevenueResponse, Service, services } from '../models'

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

    const [zrxFees, bebopFees, thorchainFees, mayachainFees, chainflipFees, portalsFees] = await Promise.all([
      zrx.getFees(startTimestamp, endTimestamp),
      bebop.getFees(startTimestamp, endTimestamp),
      thorchain.getFees(startTimestamp, endTimestamp),
      mayachain.getFees(startTimestamp, endTimestamp),
      chainflip.getFees(startTimestamp, endTimestamp),
      portals.getFees(startTimestamp, endTimestamp),
    ])

    fees.push(...zrxFees, ...bebopFees, ...thorchainFees, ...mayachainFees, ...chainflipFees, ...portalsFees)

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
    }
  }
}
