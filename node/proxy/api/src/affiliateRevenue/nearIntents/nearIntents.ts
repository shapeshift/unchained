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
import { FEE_BPS_DENOMINATOR, NEAR_INTENTS_API_KEY } from './constants'
import type { TransactionsResponse } from './types'
import { parseNearIntentsAsset, sleep } from './utils'

const fetchPage = async (
  page: number,
  startTimestamp: number,
  endTimestamp: number,
  retries = 3
): Promise<TransactionsResponse> => {
  try {
    const { data } = await axios.get<TransactionsResponse>(
      'https://explorer.near-intents.org/api/v0/transactions-pages',
      {
        params: {
          referral: 'shapeshift',
          page,
          perPage: 100,
          statuses: 'SUCCESS',
          startTimestampUnix: startTimestamp,
          endTimestampUnix: endTimestamp,
        },
        headers: { Authorization: `Bearer ${NEAR_INTENTS_API_KEY}` },
      }
    )
    return data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429 && retries > 0) {
      console.warn(`[nearIntents] Rate limited, waiting 5s before retry (${retries} retries left)`)
      await sleep(5000)
      return fetchPage(page, startTimestamp, endTimestamp, retries - 1)
    }
    throw error
  }
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []
  let page: number | undefined = 1

  while (page) {
    const data = await fetchPage(page, startTimestamp, endTimestamp)

    for (const transaction of data.data) {
      const { chainId, assetId } = parseNearIntentsAsset(transaction.originAsset)
      const txHash =
        transaction.originChainTxHashes[0] ||
        transaction.nearTxHashes[0] ||
        transaction.intentHashes ||
        ''

      for (const appFee of transaction.appFees) {
        const feeAmount = (parseFloat(transaction.amountIn) * appFee.fee) / FEE_BPS_DENOMINATOR
        const feeUsd = (parseFloat(transaction.amountInUsd) * appFee.fee) / FEE_BPS_DENOMINATOR

        fees.push({
          chainId,
          assetId,
          service: 'nearintents',
          txHash,
          timestamp: transaction.createdAtTimestamp,
          amount: String(feeAmount),
          amountUsd: String(feeUsd),
        })
      }
    }

    page = data.nextPage

    if (page) {
      await sleep(1000)
    }
  }

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
    const cached = tryGetCachedFees('nearintents', 'all', date)
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
      saveCachedFees('nearintents', 'all', date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  console.log(`[nearintents] Cache stats: ${cacheHits} hits, ${cacheMisses} misses`)

  return [...cachedFees, ...newFees, ...recentFees]
}
