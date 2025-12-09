import * as zrx from './zrx'
import * as bebop from './bebop'

const period24h = 86400
const period7d = 86400 * 7
const period30d = 86400 * 30

type Service = 'zrx' | 'bebop'

export type AffiliateRevenue = {
  amount: string
  amountUsd?: string
  assetId: string
  chainId: string
  service: Service
  timestamp: number
  txHash: string
}

class RevenueAggregator {
  private nowSeconds: number
  private revenues: Array<AffiliateRevenue> = []

  missingUsdValues = new Set<string>()

  constructor() {
    this.nowSeconds = Math.floor(Date.now() / 1000)
  }

  addRevenues(revenues: Array<AffiliateRevenue>) {
    for (const revenue of revenues) {
      // TODO: market data for missing usd values
      if (!revenue.amountUsd) this.missingUsdValues.add(revenue.assetId)
    }

    this.revenues.push(...revenues)
  }

  getRevenueByService(revenues = this.revenues) {
    const byService = new Map<Service, number>()

    for (const revenue of revenues) {
      const current = byService.get(revenue.service) ?? 0
      byService.set(revenue.service, current + parseFloat(revenue.amountUsd || '0'))
    }

    return Object.fromEntries(byService)
  }

  getRevenueByPeriod(periodSeconds: number) {
    const cutoff = this.nowSeconds - periodSeconds
    const periodRevenues = this.revenues.filter((rev) => rev.timestamp >= cutoff)

    const total = periodRevenues.reduce((sum, rev) => sum + parseFloat(rev.amountUsd || '0'), 0)
    const byService = this.getRevenueByService(periodRevenues)

    return { total, byService }
  }

  printRevenue(label: string, periodSeconds: number) {
    const { total, byService } = this.getRevenueByPeriod(periodSeconds)

    console.log(`\n${label}: $${total.toFixed(2)}`)
    Object.entries(byService).forEach(([service, amount]) => {
      console.log(`  ${service}: $${amount.toFixed(2)}`)
    })
  }
}

async function main() {
  const nowSeconds = Math.floor(Date.now() / 1000)

  const startTimestamp = nowSeconds - period30d
  const endTimestamp = nowSeconds

  const aggregator = new RevenueAggregator()

  const zrxRevenues = await zrx.getAffiliateRevenue(startTimestamp, endTimestamp)
  aggregator.addRevenues(zrxRevenues)

  const bebopRevenues = await bebop.getAffiliateRevenue(startTimestamp, endTimestamp)
  aggregator.addRevenues(bebopRevenues)

  console.log('=== Affiliate Revenue ===')
  aggregator.printRevenue('24H', period24h)
  aggregator.printRevenue('7D', period7d)
  aggregator.printRevenue('30D', period30d)

  if (aggregator.missingUsdValues.size > 0) {
    console.log('\nMissing USD values for:')
    Array.from(aggregator.missingUsdValues.values()).forEach((assetId) => {
      console.log(`  ${assetId}`)
    })
  }
}

main()
