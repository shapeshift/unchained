export type GraphQLResponse = {
  data: {
    allSwapRequests: {
      pageInfo: {
        hasNextPage: boolean
      }
      edges: Array<{
        node: {
          swapRequestNativeId: string
          completedBlockTimestamp: string
          affiliateBroker1FeeValueUsd?: string
        }
      }>
      totalCount: number
    }
  }
}
