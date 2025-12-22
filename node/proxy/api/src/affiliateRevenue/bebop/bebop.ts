import axios from 'axios'
import { Fees } from '..'
import { SLIP44 } from '../constants'
import { BEBOP_API_KEY, BEBOP_API_URL, FEE_BPS_DENOMINATOR, NANOSECONDS_PER_SECOND, SHAPESHIFT_REFERRER } from './constants'
import type { TradesResponse } from './types'

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

  const start = startTimestamp * NANOSECONDS_PER_SECOND
  const end = endTimestamp * NANOSECONDS_PER_SECOND

  const { data } = await axios.get<TradesResponse>(BEBOP_API_URL, {
    params: { source: SHAPESHIFT_REFERRER, start, end },
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
        trade.volumeUsd !== undefined ? String(trade.volumeUsd * (Number(trade.partnerFeeBps) / FEE_BPS_DENOMINATOR)) : undefined,
    })
  }

  return fees
}
