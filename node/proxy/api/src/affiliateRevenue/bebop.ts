import axios from 'axios'
import { Fees } from '.'
import { SLIP44 } from './constants'

const BEBOP_API_KEY = process.env.BEBOP_API_KEY

if (!BEBOP_API_KEY) throw new Error('BEBOP_API_KEY env var not set')

type TradesResponse = {
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

// https://docs.bebop.xyz/bebop/trade-history-api/history-api-endpoints/all-trades
export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

  const start = startTimestamp * 1_000_000_000 // nanoseconds
  const end = endTimestamp * 1_000_000_000 // nanoseconds

  const { data } = await axios.get<TradesResponse>('https://api.bebop.xyz/history/v2/trades', {
    params: { source: 'shapeshift', start, end },
    headers: { 'source-auth': BEBOP_API_KEY },
  })

  for (const trade of data.results) {
    if (!trade.partnerFeeBps || !trade.partnerFeeNative) continue

    const chainId = `eip155:${trade.chain_id}`
    const assetId = `${chainId}/slip44:${SLIP44.ETHEREUM}`

    fees.push({
      chainId,
      assetId,
      service: 'bebop',
      txHash: trade.txHash,
      timestamp: Math.floor(new Date(trade.timestamp).getTime() / 1000),
      amount: trade.partnerFeeNative,
      amountUsd:
        trade.volumeUsd !== undefined ? String(trade.volumeUsd * (Number(trade.partnerFeeBps) / 10000)) : undefined,
    })
  }

  return fees
}
