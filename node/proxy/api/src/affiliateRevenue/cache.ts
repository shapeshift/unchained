import axios from 'axios'
import { Logger } from '@shapeshiftoss/logger'
import { AffiliateRevenueResponse, Service, services } from '../models'

const logger = new Logger({
  namespace: ['unchained', 'proxy', 'api', 'affiliateRevenueCache'],
  level: process.env.LOG_LEVEL,
})
import { Fees } from './index'
import * as bebop from './bebop'
import * as butterswap from './butterswap'
import * as chainflip from './chainflip'
import * as mayachain from './mayachain'
import * as nearintents from './nearIntents'
import * as portals from './portals'
import * as relay from './relay'
import * as thorchain from './thorchain'
import * as zrx from './zrx'

const INITIAL_LOAD_DAYS = 90
const UPDATE_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const OVERLAP_SECONDS = 2 * 60 // 2 minutes

// ButterSwap returns aggregate balance deltas, not individual transactions.
// It cannot be cached because the timestamp represents the query end time,
// not when transactions occurred. It must always be fetched live.
const cacheableProviders: Service[] = [
  'bebop',
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

class AffiliateRevenueCache {
  private cache: Map<string, Fees> = new Map()
  private lastUpdated: number = 0
  private initialized: boolean = false

  private getCacheKey(fee: Fees): string {
    return `${fee.service}:${fee.txHash}:${fee.timestamp}`
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Affiliate revenue cache initializing')

      const now = Math.floor(Date.now() / 1000)
      const ninetyDaysAgo = now - INITIAL_LOAD_DAYS * 24 * 60 * 60

      await this.fetchAndStore(ninetyDaysAgo, now)
      this.lastUpdated = now
      this.initialized = true

      logger.info(`Affiliate revenue cache initialized with ${this.cache.size} entries`)

      setInterval(async () => {
        await this.incrementalUpdate()
      }, UPDATE_INTERVAL_MS)
    } catch (err) {
      logger.error(err, 'Failed to initialize affiliate revenue cache')
    }
  }

  private async incrementalUpdate(): Promise<void> {
    try {
      logger.info('Affiliate revenue cache updating')

      const now = Math.floor(Date.now() / 1000)
      const since = this.lastUpdated - OVERLAP_SECONDS

      await this.fetchAndStore(since, now)
      this.lastUpdated = now

      logger.info(`Affiliate revenue cache updated, now has ${this.cache.size} entries`)
    } catch (err) {
      logger.error(err, 'Failed to update affiliate revenue cache')
    }
  }

  private async fetchAndStore(startTimestamp: number, endTimestamp: number): Promise<void> {
    const results = await Promise.allSettled([
      bebop.getFees(startTimestamp, endTimestamp),
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
        for (const fee of result.value) {
          const key = this.getCacheKey(fee)
          this.cache.set(key, fee)
        }
      } else {
        const provider = cacheableProviders[index]
        logger.error(`${provider} failed during cache update: ${formatError(result.reason)}`)
      }
    })
  }

  isInitialized(): boolean {
    return this.initialized
  }

  async getRevenue(startTimestamp: number, endTimestamp: number): Promise<AffiliateRevenueResponse> {
    const fees: Fees[] = []
    const failedProviders: Service[] = []

    for (const fee of this.cache.values()) {
      if (fee.timestamp >= startTimestamp && fee.timestamp <= endTimestamp) {
        fees.push(fee)
      }
    }

    // ButterSwap must always be fetched live since it returns aggregate deltas
    try {
      const butterswapFees = await butterswap.getFees(startTimestamp, endTimestamp)
      fees.push(...butterswapFees)
    } catch (err) {
      failedProviders.push('butterswap')
      logger.error(`butterswap failed during live fetch: ${formatError(err)}`)
    }

    const byService: Record<Service, number> = {} as Record<Service, number>

    for (const service of services) {
      byService[service] = 0
    }

    for (const fee of fees) {
      byService[fee.service] = (byService[fee.service] || 0) + parseFloat(fee.amountUsd || '0')
    }

    const totalUsd = fees.reduce((sum, fee) => sum + parseFloat(fee.amountUsd || '0'), 0)

    return {
      totalUsd,
      byService,
      failedProviders,
    }
  }
}

export const affiliateRevenueCache = new AffiliateRevenueCache()
