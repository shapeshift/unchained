export type FeesResponse = {
  fees: Array<{
    address: string
    amount: string
    asset: string
    blockHash: string
    blockHeight: number
    timestamp: number
    txId: string
  }>
}
