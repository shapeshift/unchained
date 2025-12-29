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
import { DAO_TREASURY_BASE } from '../constants'
import { RELAY_API_URL, SHAPESHIFT_REFERRER } from './constants'
import type { RelayResponse } from './types'
import { buildAssetId, getChainConfig } from './utils'

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []
  let continuation: string | undefined

  do {
    const { data } = await axios.get<RelayResponse>(`${RELAY_API_URL}/requests/v2`, {
      params: {
        referrer: SHAPESHIFT_REFERRER,
        startTimestamp,
        endTimestamp,
        status: 'success',
        continuation,
      },
    })

    for (const request of data.requests) {
      const appFees = request.data?.appFees ?? []

      const relevantFees = appFees.filter(
        (fee) => fee.recipient.toLowerCase() === DAO_TREASURY_BASE.toLowerCase()
      )

      if (relevantFees.length === 0) continue

      const currencyObject =
        request.data?.feeCurrencyObject ?? request.data?.metadata?.currencyIn?.currency
      if (!currencyObject) continue

      const { chainId, slip44, isEvm } = getChainConfig(currencyObject.chainId)
      const assetId = buildAssetId(chainId, slip44, currencyObject.address, isEvm)

      const txHash = request.data?.inTxs?.[0]?.hash ?? ''
      const timestamp = Math.floor(new Date(request.createdAt).getTime() / 1000)

      for (const appFee of relevantFees) {
        fees.push({
          chainId,
          assetId,
          service: 'relay',
          txHash,
          timestamp,
          amount: appFee.amount,
          amountUsd: appFee.amountUsd,
        })
      }
    }

    continuation = data.continuation
  } while (continuation)

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const cachedFees: Fees[] = []
  const datesToFetch: string[] = []
  let cacheHits = 0
  let cacheMisses = 0

  for (const date of cacheableDates) {
    const cached = tryGetCachedFees('relay', 'all', date)
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
      saveCachedFees('relay', 'all', date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  console.log(`[relay] Cache stats: ${cacheHits} hits, ${cacheMisses} misses`)

  return [...cachedFees, ...newFees, ...recentFees]
}
