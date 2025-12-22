import axios from 'axios'
import { Fees } from '..'
import { FEE_BPS_DENOMINATOR, NEAR_INTENTS_API_KEY } from './constants'
import type { TransactionsResponse } from './types'
import { parseNearIntentsAsset, sleep } from './utils'

const fetchPage = async (
  page: number,
  startTimestamp: number,
  endTimestamp: number,
  retries = 3
): Promise<TransactionsResponse> => {
  try {
    const { data } = await axios.get<TransactionsResponse>(
      'https://explorer.near-intents.org/api/v0/transactions-pages',
      {
        params: {
          referral: 'shapeshift',
          page,
          perPage: 100,
          statuses: 'SUCCESS',
          startTimestampUnix: startTimestamp,
          endTimestampUnix: endTimestamp,
        },
        headers: { Authorization: `Bearer ${NEAR_INTENTS_API_KEY}` },
      }
    )
    return data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429 && retries > 0) {
      console.warn(`[nearIntents] Rate limited, waiting 5s before retry (${retries} retries left)`)
      await sleep(5000)
      return fetchPage(page, startTimestamp, endTimestamp, retries - 1)
    }
    throw error
  }
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

  let page: number | undefined = 1

  while (page) {
    const data = await fetchPage(page, startTimestamp, endTimestamp)

    for (const transaction of data.data) {
      const { chainId, assetId } = parseNearIntentsAsset(transaction.originAsset)
      const txHash =
        transaction.originChainTxHashes[0] ||
        transaction.nearTxHashes[0] ||
        transaction.intentHashes ||
        ''

      for (const appFee of transaction.appFees) {
        const feeAmount = (parseFloat(transaction.amountIn) * appFee.fee) / FEE_BPS_DENOMINATOR
        const feeUsd = (parseFloat(transaction.amountInUsd) * appFee.fee) / FEE_BPS_DENOMINATOR

        fees.push({
          chainId,
          assetId,
          service: 'nearintents',
          txHash,
          timestamp: transaction.createdAtTimestamp,
          amount: String(feeAmount),
          amountUsd: String(feeUsd),
        })
      }
    }

    page = data.nextPage

    if (page) {
      await sleep(1000)
    }
  }

  return fees
}
