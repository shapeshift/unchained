import axios from 'axios'
import * as bebop from './bebop'
import * as butterswap from './butterswap'
import { timestampToDate } from './cache'
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

    const byDate: AffiliateRevenueResponse['byDate'] = {}

    for (const fee of fees) {
      const date = timestampToDate(fee.timestamp)

      if (!byDate[date]) {
        byDate[date] = {
          totalUsd: 0,
          byService: Object.fromEntries(services.map((s) => [s, 0])) as Record<Service, number>,
        }
      }

      const amountUsd = parseFloat(fee.amountUsd || '0')
      byDate[date].totalUsd += amountUsd
      byDate[date].byService[fee.service] += amountUsd
    }

    const byService = Object.fromEntries(services.map((s) => [s, 0])) as Record<Service, number>

    for (const daily of Object.values(byDate)) {
      for (const service of services) {
        byService[service] += daily.byService[service]
      }
    }

    const totalUsd = Object.values(byDate).reduce((sum, daily) => sum + daily.totalUsd, 0)

    return {
      totalUsd,
      byService,
      byDate,
      failedProviders,
    }
  }
}
