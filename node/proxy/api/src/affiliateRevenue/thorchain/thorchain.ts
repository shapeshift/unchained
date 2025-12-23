import axios from 'axios'
import { Fees } from '..'
import {
  getCacheableThreshold,
  getDateEndTimestamp,
  getDateStartTimestamp,
  groupFeesByDate,
  saveCachedFees,
  splitDateRange,
  tryGetCachedFees,
} from '../cache'
import { SLIP44, THORCHAIN_CHAIN_ID } from '../constants'
import { MILLISECONDS_PER_SECOND, PRICE_API_URL, RUNE_DECIMALS, THORCHAIN_API_URL } from './constants'
import type { FeesResponse } from './types'

const getRunePriceUsd = async (): Promise<number> => {
  const { data } = await axios.get<{ thorchain: { usd: string } }>(PRICE_API_URL, {
    params: {
      vs_currencies: 'usd',
      ids: 'thorchain',
    },
  })

  return Number(data.thorchain.usd)
}

const transformFee = (fee: FeesResponse['fees'][0], runePriceUsd: number): Fees => {
  const chainId = THORCHAIN_CHAIN_ID
  const assetId = `${chainId}/slip44:${SLIP44.THORCHAIN}`

  return {
    chainId,
    assetId,
    service: 'thorchain',
    txHash: fee.txId,
    timestamp: Math.round(fee.timestamp / 1000),
    amount: fee.amount,
    amountUsd: ((Number(fee.amount) / 10 ** RUNE_DECIMALS) * runePriceUsd).toString(),
  }
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const start = startTimestamp * MILLISECONDS_PER_SECOND
  const end = endTimestamp * MILLISECONDS_PER_SECOND

  const { data } = await axios.get<FeesResponse>(THORCHAIN_API_URL, {
    params: { start, end },
  })

  const runePriceUsd = await getRunePriceUsd()

  return data.fees.map(fee => transformFee(fee, runePriceUsd))
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const cachedFees: Fees[] = []
  const datesToFetch: string[] = []
  let cacheHits = 0
  let cacheMisses = 0

  for (const date of cacheableDates) {
    const cached = tryGetCachedFees('thorchain', THORCHAIN_CHAIN_ID, date)
    if (cached) {
      cachedFees.push(...cached)
      cacheHits++
    } else {
      datesToFetch.push(date)
      cacheMisses++
    }
  }

  const newFees: Fees[] = []
  if (datesToFetch.length > 0) {
    const fetchStart = getDateStartTimestamp(datesToFetch[0])
    const fetchEnd = getDateEndTimestamp(datesToFetch[datesToFetch.length - 1])
    const fetched = await fetchFeesFromAPI(fetchStart, fetchEnd)

    const feesByDate = groupFeesByDate(fetched)
    for (const date of datesToFetch) {
      saveCachedFees('thorchain', THORCHAIN_CHAIN_ID, date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  console.log(`[thorchain] Cache stats: ${cacheHits} hits, ${cacheMisses} misses`)

  return [...cachedFees, ...newFees, ...recentFees]
}
