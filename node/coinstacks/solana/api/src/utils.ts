import { EnrichedTransaction } from 'helius-sdk'
import { Tx } from './models'
import axios from 'axios'
import { handleError } from '@shapeshiftoss/common-api'
import { RPC_API_KEY, INDEXER_URL } from './constants'

export const axiosNoRetry = axios.create({ timeout: 5000, params: { 'api-key': RPC_API_KEY } })

export const getTransaction = async (txid: string): Promise<Tx> => {
  try {
    const { data } = await axiosNoRetry.post<EnrichedTransaction[]>(`${INDEXER_URL}/v0/transactions/`, {
      transactions: [txid],
    })

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
