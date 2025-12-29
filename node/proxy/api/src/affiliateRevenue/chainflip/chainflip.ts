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
import { ETHEREUM_CHAIN_ID } from '../constants'
import { CHAINFLIP_API_URL, GET_AFFILIATE_SWAPS_QUERY, PAGE_SIZE, SHAPESHIFT_BROKER_ID } from './constants'
import type { GraphQLResponse } from './types'

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []
  const startDate = new Date(startTimestamp * 1000).toISOString()
  const endDate = new Date(endTimestamp * 1000).toISOString()

  let offset = 0
  let hasNextPage = true
  do {
    const { data } = await axios.post<GraphQLResponse>(CHAINFLIP_API_URL, {
      query: GET_AFFILIATE_SWAPS_QUERY,
      variables: {
        affiliateBrokerId: SHAPESHIFT_BROKER_ID,
        startDate,
        endDate,
        first: PAGE_SIZE,
        offset,
      },
      operationName: 'GetAffiliateSwaps',
    })

    const { edges, pageInfo } = data.data.allSwapRequests

    for (const { node: swap } of edges) {
      if (!swap.affiliateBroker1FeeValueUsd) continue

      const chainId = ETHEREUM_CHAIN_ID
      const assetId = `${chainId}/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`

      fees.push({
        chainId,
        assetId,
        service: 'chainflip',
        txHash: '',
        timestamp: Math.floor(new Date(swap.completedBlockTimestamp).getTime() / 1000),
        amount: '0',
        amountUsd: swap.affiliateBroker1FeeValueUsd,
      })
    }

    hasNextPage = pageInfo.hasNextPage
    offset += PAGE_SIZE
  } while (hasNextPage)

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
    const cached = tryGetCachedFees('chainflip', ETHEREUM_CHAIN_ID, date)
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
      saveCachedFees('chainflip', ETHEREUM_CHAIN_ID, date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  console.log(`[chainflip] Cache stats: ${cacheHits} hits, ${cacheMisses} misses`)

  return [...cachedFees, ...newFees, ...recentFees]
}
