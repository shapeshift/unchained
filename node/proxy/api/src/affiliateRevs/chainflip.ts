import axios from 'axios'
import { AffiliateRevenue } from '.'

const URL = 'https://reporting-service.chainflip.io/graphql'

const pageSize = 100
const affiliateBrokerId = 'cFMeDPtPHccVYdBSJKTtCYuy7rewFNpro3xZBKaCGbSS2xhRi'

const GET_AFFILIATE_SWAPS_QUERY = `
  query GetAffiliateSwaps(
    $affiliateBrokerId: String!
    $startDate: Datetime!
    $endDate: Datetime!
    $first: Int!
    $offset: Int!
  ) {
    allSwapRequests(
      offset: $offset
      first: $first
      filter: {
        affiliateBroker1AccountSs58Id: {equalTo: $affiliateBrokerId}
        completedBlockTimestamp: {
          greaterThanOrEqualTo: $startDate
          lessThanOrEqualTo: $endDate
        }
        status: {equalTo: SUCCESS}
      }
    ) {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          swapRequestNativeId
          completedBlockTimestamp
          affiliateBroker1FeeValueUsd
        }
      }
      totalCount
    }
  }
`

type SwapNode = {
  swapRequestNativeId: string
  completedBlockTimestamp: string
  affiliateBroker1FeeValueUsd?: string
}

type GraphQLResponse = {
  data: {
    allSwapRequests: {
      pageInfo: {
        hasNextPage: boolean
      }
      edges: Array<{
        node: SwapNode
      }>
      totalCount: number
    }
  }
}

export const getAffiliateRevenue = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<Array<AffiliateRevenue>> => {
  const revenues: Array<AffiliateRevenue> = []

  const startDate = new Date(startTimestamp * 1000).toISOString()
  const endDate = new Date(endTimestamp * 1000).toISOString()

  let offset = 0
  let hasNextPage = true
  do {
    const { data } = await axios.post<GraphQLResponse>(URL, {
      query: GET_AFFILIATE_SWAPS_QUERY,
      variables: {
        affiliateBrokerId,
        startDate,
        endDate,
        first: pageSize,
        offset,
      },
      operationName: 'GetAffiliateSwaps',
    })

    const { edges, pageInfo } = data.data.allSwapRequests

    for (const { node: swap } of edges) {
      if (!swap.affiliateBroker1FeeValueUsd) continue

      // Chainflip affiliate fees are always paid in USDC
      const chainId = 'eip155:1'
      const assetId = `${chainId}/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`

      revenues.push({
        chainId,
        assetId,
        service: 'chainflip',
        txHash: '', // requires additional GetSwapByNativeId query
        timestamp: Math.floor(new Date(swap.completedBlockTimestamp).getTime() / 1000),
        amount: '0', // requires additional GetSwapByNativeId query
        amountUsd: swap.affiliateBroker1FeeValueUsd,
      })
    }

    hasNextPage = pageInfo.hasNextPage
    offset += pageSize
  } while (hasNextPage)

  return revenues
}
