import axios from 'axios'
import { Fees } from '..'
import { SLIP44, THORCHAIN_CHAIN_ID } from '../constants'
import { MILLISECONDS_PER_SECOND, PRICE_API_URL, RUNE_DECIMALS, THORCHAIN_API_URL } from './constants'
import type { FeesResponse } from './types'

const getRunePriceUsd = async (): Promise<number> => {
  const { data } = await axios.get<{ thorchain: { usd: string } }>(PRICE_API_URL, {
    params: {
      vs_currencies: 'usd',
      ids: 'thorchain',
    },
  })

  return Number(data.thorchain.usd)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

  const start = startTimestamp * MILLISECONDS_PER_SECOND
  const end = endTimestamp * MILLISECONDS_PER_SECOND

  const { data } = await axios.get<FeesResponse>(THORCHAIN_API_URL, {
    params: { start, end },
  })

  const runePriceUsd = await getRunePriceUsd()

  const chainId = THORCHAIN_CHAIN_ID
  const assetId = `${chainId}/slip44:${SLIP44.THORCHAIN}`

  for (const fee of data.fees) {
    fees.push({
      chainId,
      assetId,
      service: 'thorchain',
      txHash: fee.txId,
      timestamp: Math.round(fee.timestamp / 1000),
      amount: fee.amount,
      amountUsd: ((Number(fee.amount) / 10 ** RUNE_DECIMALS) * runePriceUsd).toString(),
    })
  }

  return fees
}
