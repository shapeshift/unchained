export type TradesResponse = {
  results: Array<{
    chain_id: number
    txHash: string
    status: string
    type: string
    taker: string
    receiver: string
    sellTokens: Record<string, { amount?: string; amountUsd?: number }>
    buyTokens: Record<string, { amount?: string; amountUsd?: number }>
    volumeUsd?: number
    gasFeeUsd?: number
    timestamp: string
    route: 'JAM' | 'PMM'
    gasless: boolean
    partnerFeeNative?: string
    partnerFeeBps?: string
  }>
  nextAvailableTimestamp?: string
  metadata: {
    timestamp: string
    results?: number
    tokens: Record<
      string,
      Record<
        string,
        {
          name: string
          symbol: string
          decimals: number
          displayDecimals?: number
          icon?: string
        }
      >
    >
  }
}
