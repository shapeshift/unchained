import { LRUCache } from 'lru-cache'
import type { Fees } from './index'
import type { TokenTransfer } from './portals/types'

export const feeCache = new LRUCache<string, Fees[]>({
  max: 5000,
  maxSize: 500_000_000,
  sizeCalculation: (fees) => fees.length * 200 + 100,
  ttl: 1000 * 60 * 60 * 24 * 90,
  updateAgeOnGet: true,
  updateAgeOnHas: false,
})

export const tokenTransferCache = new LRUCache<string, { transfer: TokenTransfer | null }>({
  max: 500,
  ttl: 1000 * 60 * 60 * 24 * 7,
})

export const decimalsCache = new LRUCache<string, number>({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24 * 90,
})

export const timestampToDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000)
  return date.toISOString().split('T')[0]
}

export const getDateRange = (startTimestamp: number, endTimestamp: number): string[] => {
  const dates: string[] = []
  const start = new Date(startTimestamp * 1000)
  const end = new Date(endTimestamp * 1000)

  start.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(0, 0, 0, 0)

  const current = new Date(start)
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

export const getDateStartTimestamp = (date: string): number => {
  return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000)
}

export const getDateEndTimestamp = (date: string): number => {
  return Math.floor(new Date(date + 'T23:59:59Z').getTime() / 1000)
}

export const getCacheableThreshold = (): number => {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return Math.floor(today.getTime() / 1000)
}

export const getCacheKey = (service: string, chainId: string, date: string): string => {
  return `${service}:${chainId}:${date}`
}

export const tryGetCachedFees = (service: string, chainId: string, date: string): Fees[] | undefined => {
  const key = getCacheKey(service, chainId, date)
  return feeCache.get(key)
}

export const saveCachedFees = (service: string, chainId: string, date: string, fees: Fees[]): void => {
  const key = getCacheKey(service, chainId, date)
  feeCache.set(key, fees)
}

export const splitDateRange = (
  startTimestamp: number,
  endTimestamp: number,
  cacheableThreshold: number
): { cacheableDates: string[]; recentStart: number | null } => {
  const allDates = getDateRange(startTimestamp, endTimestamp)
  const cacheableDates: string[] = []
  let recentStart: number | null = null

  for (const date of allDates) {
    const dateEnd = getDateEndTimestamp(date)
    if (dateEnd < cacheableThreshold) {
      cacheableDates.push(date)
    } else if (recentStart === null) {
      recentStart = Math.max(startTimestamp, cacheableThreshold)
    }
  }

  return { cacheableDates, recentStart }
}

export const groupFeesByDate = (fees: Fees[]): Record<string, Fees[]> => {
  const feesByDate: Record<string, Fees[]> = {}

  for (const fee of fees) {
    const date = timestampToDate(fee.timestamp)
    if (!feesByDate[date]) {
      feesByDate[date] = []
    }
    feesByDate[date].push(fee)
  }

  return feesByDate
}

export const getCachedTokenTransfer = (key: string): TokenTransfer | null | undefined => {
  const cached = tokenTransferCache.get(key)
  return cached ? cached.transfer : undefined
}

export const saveCachedTokenTransfer = (key: string, transfer: TokenTransfer | null): void => {
  tokenTransferCache.set(key, { transfer })
}

export const getCachedDecimals = (key: string): number | undefined => {
  return decimalsCache.get(key)
}

export const saveCachedDecimals = (key: string, decimals: number): void => {
  decimalsCache.set(key, decimals)
}
