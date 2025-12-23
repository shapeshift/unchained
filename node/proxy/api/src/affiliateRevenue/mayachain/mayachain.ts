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
import { MAYACHAIN_CHAIN_ID, SLIP44 } from '../constants'
import { CACAO_DECIMALS, MAYACHAIN_API_URL, MILLISECONDS_PER_SECOND, PRICE_API_URL } from './constants'
import type { FeesResponse } from './types'

const getCacaoPriceUsd = async (): Promise<number> => {
  const { data } = await axios.get<{ cacao: { usd: string } }>(PRICE_API_URL, {
    params: {
      vs_currencies: 'usd',
      ids: 'cacao',
    },
  })

  return Number(data.cacao.usd)
}

const transformFee = (fee: FeesResponse['fees'][0], cacaoPriceUsd: number): Fees => {
  const chainId = MAYACHAIN_CHAIN_ID
  const assetId = `${chainId}/slip44:${SLIP44.MAYACHAIN}`

  return {
    chainId,
    assetId,
    service: 'mayachain',
    txHash: fee.txId,
    timestamp: Math.round(fee.timestamp / 1000),
    amount: fee.amount,
    amountUsd: ((Number(fee.amount) / 10 ** CACAO_DECIMALS) * cacaoPriceUsd).toString(),
  }
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const start = startTimestamp * MILLISECONDS_PER_SECOND
  const end = endTimestamp * MILLISECONDS_PER_SECOND

  const { data } = await axios.get<FeesResponse>(MAYACHAIN_API_URL, {
    params: { start, end },
  })

  const cacaoPriceUsd = await getCacaoPriceUsd()

  return data.fees.map(fee => transformFee(fee, cacaoPriceUsd))
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const cachedFees: Fees[] = []
  const datesToFetch: string[] = []
  let cacheHits = 0
  let cacheMisses = 0

  for (const date of cacheableDates) {
    const cached = tryGetCachedFees('mayachain', MAYACHAIN_CHAIN_ID, date)
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
      saveCachedFees('mayachain', MAYACHAIN_CHAIN_ID, date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  console.log(`[mayachain] Cache stats: ${cacheHits} hits, ${cacheMisses} misses`)

  return [...cachedFees, ...newFees, ...recentFees]
}
