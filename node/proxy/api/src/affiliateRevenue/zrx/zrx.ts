import axios from 'axios'
import { Fees } from '..'
import { SLIP44 } from '../constants'
import { NATIVE_TOKEN_ADDRESS, SERVICES, ZRX_API_KEY, ZRX_API_URL } from './constants'
import type { TradesResponse } from './types'

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

  for (const service of SERVICES) {
    let cursor: string | undefined

    do {
      const { data } = await axios.get<TradesResponse>(`${ZRX_API_URL}/${service}`, {
        params: { cursor, startTimestamp, endTimestamp },
        headers: {
          '0x-api-key': ZRX_API_KEY,
          '0x-version': 'v2',
        },
      })

      for (const trade of data.trades) {
        const token = trade.fees.integratorFee?.token

        if (!trade.fees.integratorFee?.amount || !token) continue

        const chainId = `eip155:${trade.chainId}`
        const assetId =
          token.toLowerCase() === NATIVE_TOKEN_ADDRESS ? `${chainId}/slip44:${SLIP44.ETHEREUM}` : `${chainId}/erc20:${token}`

        fees.push({
          chainId,
          assetId,
          service: 'zrx',
          txHash: trade.transactionHash,
          timestamp: trade.timestamp,
          amount: trade.fees.integratorFee.amount,
          amountUsd: trade.fees.integratorFee.amountUsd,
        })
      }

      cursor = data.nextCursor
    } while (cursor)
  }

  return fees
}
