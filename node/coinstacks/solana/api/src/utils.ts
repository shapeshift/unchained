import { EnrichedTransaction } from 'helius-sdk'
import { Tx } from './models'
import axios from 'axios'
import { createAxiosRetry, exponentialDelay, handleError } from '@shapeshiftoss/common-api'
import { RPC_API_KEY, INDEXER_URL } from './constants'

export const axiosNoRetry = axios.create({ timeout: 5000, params: { 'api-key': RPC_API_KEY } })

const axiosWithRetry = createAxiosRetry({ timeout: 10000, params: { 'api-key': RPC_API_KEY } })

export const getTransaction = async (txid: string, shouldRetry?: boolean, retryCount = 0): Promise<Tx> => {
  try {
    const axiosInstance = shouldRetry ? axiosWithRetry : axiosNoRetry

    const { data } = await axiosInstance.post<EnrichedTransaction[]>(`${INDEXER_URL}/v0/transactions/`, {
      transactions: [txid],
    })

    if (shouldRetry) {
      if (!data[0]) {
        if (++retryCount >= 5) throw new Error(`Transaction not found`)
        await exponentialDelay(retryCount)
        return getTransaction(txid, true, retryCount)
      }
    }

    const rawTx = data[0]

    if (!rawTx) throw new Error('Transaction not found')

    const tx = {
      txid: rawTx.signature,
      blockHeight: rawTx.slot,
      ...rawTx,
    }

    return tx
  } catch (err) {
    throw handleError(err)
  }
}
