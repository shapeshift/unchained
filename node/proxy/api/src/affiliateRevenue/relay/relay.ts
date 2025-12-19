import axios from 'axios'
import { Fees } from '..'
import { DAO_TREASURY_BASE } from '../constants'
import { RELAY_API_URL, SHAPESHIFT_REFERRER } from './constants'
import type { RelayResponse } from './types'
import { buildAssetId, getChainConfig } from './utils'

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []
  let continuation: string | undefined

  do {
    const { data } = await axios.get<RelayResponse>(`${RELAY_API_URL}/requests/v2`, {
      params: {
        referrer: SHAPESHIFT_REFERRER,
        startTimestamp,
        endTimestamp,
        status: 'success',
        continuation,
      },
    })

    for (const request of data.requests) {
      const appFees = request.data?.appFees ?? []

      const relevantFees = appFees.filter(
        (fee) => fee.recipient.toLowerCase() === DAO_TREASURY_BASE.toLowerCase()
      )

      if (relevantFees.length === 0) continue

      const currencyObject =
        request.data?.feeCurrencyObject ?? request.data?.metadata?.currencyIn?.currency
      if (!currencyObject) continue

      const { chainId, slip44, isEvm } = getChainConfig(currencyObject.chainId)
      const assetId = buildAssetId(chainId, slip44, currencyObject.address, isEvm)

      const txHash = request.data?.inTxs?.[0]?.hash ?? ''
      const timestamp = Math.floor(new Date(request.createdAt).getTime() / 1000)

      for (const appFee of relevantFees) {
        fees.push({
          chainId,
          assetId,
          service: 'relay',
          txHash,
          timestamp,
          amount: appFee.amount,
          amountUsd: appFee.amountUsd,
        })
      }
    }

    continuation = data.continuation
  } while (continuation)

  return fees
}
