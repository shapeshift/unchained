import axios from 'axios'
import { Fees } from '..'
import { MAYACHAIN_CHAIN_ID, SLIP44 } from '../constants'
import { CACAO_DECIMALS, MAYACHAIN_API_URL, MILLISECONDS_PER_SECOND, PRICE_API_URL } from './constants'
import type { FeesResponse } from './types'

const getCacaoPriceUsd = async (): Promise<number> => {
  const { data } = await axios.get<{ cacao: { usd: string } }>(PRICE_API_URL, {
    params: {
      vs_currencies: 'usd',
      ids: 'cacao',
    },
  })

  return Number(data.cacao.usd)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const revenues: Array<Fees> = []

  const start = startTimestamp * MILLISECONDS_PER_SECOND
  const end = endTimestamp * MILLISECONDS_PER_SECOND

  const { data } = await axios.get<FeesResponse>(MAYACHAIN_API_URL, {
    params: { start, end },
  })

  const cacaoPriceUsd = await getCacaoPriceUsd()

  const chainId = MAYACHAIN_CHAIN_ID
  const assetId = `${chainId}/slip44:${SLIP44.MAYACHAIN}`

  for (const fee of data.fees) {
    revenues.push({
      chainId,
      assetId,
      service: 'mayachain',
      txHash: fee.txId,
      timestamp: Math.round(fee.timestamp / 1000),
      amount: fee.amount,
      amountUsd: ((Number(fee.amount) / 10 ** CACAO_DECIMALS) * cacaoPriceUsd).toString(),
    })
  }

  return revenues
}
