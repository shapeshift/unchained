type Fee = {
  token?: string
  amount?: string
  amountUsd?: string
}

export type TradesResponse = {
  nextCursor?: string
  trades: Array<{
    appName: string
    blockNumber: string
    buyToken: string
    buyAmount?: string
    chainId: number
    chainName: string
    fees: {
      integratorFee?: Fee
      zeroExFee?: Fee
    }
    gasUsed: string
    protocolVersion: '0xv4' | 'Settler'
    sellToken: string
    sellAmount?: string
    slippageBps?: string
    taker: string
    timestamp: number
    tokens: Array<{
      address: string
      symbol?: string
    }>
    transactionHash: string
    volumeUsd?: string
    zid: string
    service: 'gasless' | 'swap'
  }>
  zid: string
}
