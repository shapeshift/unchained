import axios from 'axios'
import { Fees } from '.'

const NEAR_INTENTS_API_KEY = process.env.NEAR_INTENTS_API_KEY

if (!NEAR_INTENTS_API_KEY) throw new Error('NEAR_INTENTS_API_KEY env var not set')

type TransactionsResponse = {
  data: Array<{
    originAsset: string
    destinationAsset: string
    depositAddress: string
    recipient: string
    status: string
    createdAt: string
    createdAtTimestamp: number
    intentHashes: string
    referral: string
    amountInFormatted: string
    amountOutFormatted: string
    appFees: Array<{
      fee: number
      recipient: string
    }>
    nearTxHashes: string[]
    originChainTxHashes: string[]
    destinationChainTxHashes: string[]
    amountIn: string
    amountInUsd: string
    amountOut: string
    amountOutUsd: string
    refundTo: string
  }>
  totalPages: number
  page: number
  perPage: number
  total: number
  nextPage?: number
  prevPage?: number
}

// https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api
export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

  let page: number | undefined = 1
  while (page) {
    const { data } = (await axios.get<TransactionsResponse>(
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
    )) as { data: TransactionsResponse }

    for (const transaction of data.data) {
      for (const appFee of transaction.appFees) {
        // TODO: Figure out parsing of originAsset/destinationAsset
        const chainId = ''
        const assetId = `${chainId}/`

        fees.push({
          chainId,
          assetId,
          service: 'nearintents',
          txHash: '', // TODO: determine if origin or destination chain tx hash is directly tied to the fee or which makes the most sense to use
          timestamp: transaction.createdAtTimestamp,
          amount: String((parseFloat(transaction.amountIn) * appFee.fee) / 10000),
          amountUsd: String((parseFloat(transaction.amountInUsd) * appFee.fee) / 10000),
        })
      }
    }

    page = data.nextPage
  }

  return fees
}
