export const CHAINFLIP_API_URL = 'https://reporting-service.chainflip.io/graphql'
export const PAGE_SIZE = 100
export const SHAPESHIFT_BROKER_ID = 'cFMeDPtPHccVYdBSJKTtCYuy7rewFNpro3xZBKaCGbSS2xhRi'

export const GET_AFFILIATE_SWAPS_QUERY = `
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
