import axios from 'axios'
import { Fees } from '..'
import { CHAINFLIP_API_URL, GET_AFFILIATE_SWAPS_QUERY, PAGE_SIZE, SHAPESHIFT_BROKER_ID } from './constants'
import type { GraphQLResponse } from './types'

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

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

      const chainId = 'eip155:1'
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
