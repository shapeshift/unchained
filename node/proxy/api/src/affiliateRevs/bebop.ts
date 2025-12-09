import axios from 'axios'
import { AffiliateRevenue } from '.'

const API_KEY = 'b4a7ffa9-2abb-45ae-8ddd-ec33bc377939'
const URL = 'https://api.bebop.xyz'

type Trade = {
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
}

type TradesResponse = {
  results: Trade[]
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

export const getAffiliateRevenue = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<Array<AffiliateRevenue>> => {
  const trades: Array<Trade> = []

  const start = startTimestamp * 1_000_000_000 // nanoseconds
  const end = endTimestamp * 1_000_000_000 // nanoseconds

  const { data } = await axios.get<TradesResponse>(`${URL}/history/v2/trades`, {
    params: { source: 'shapeshift', start, end },
    headers: { 'source-auth': API_KEY },
  })

  trades.push(...data.results)

  return trades.reduce<Array<AffiliateRevenue>>((revs, trade) => {
    if (!trade.partnerFeeBps || !trade.partnerFeeNative) return revs

    const chainId = `eip155:${trade.chain_id}`
    const assetId = `${chainId}/slip44:60`

    revs.push({
      chainId,
      assetId,
      service: 'bebop',
      txHash: trade.txHash,
      timestamp: Math.floor(new Date(trade.timestamp).getTime() / 1000),
      amount: trade.partnerFeeNative,
      amountUsd:
        trade.volumeUsd !== undefined ? String(trade.volumeUsd * (Number(trade.partnerFeeBps) / 10000)) : undefined,
    })

    return revs
  }, [])
}
