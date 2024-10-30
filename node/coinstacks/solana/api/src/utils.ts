import { createAxiosRetry, exponentialDelay, handleError } from '@shapeshiftoss/common-api'
import axios from 'axios'
import { EnrichedTransaction } from 'helius-sdk'
import { Tx } from './models'

const INDEXER_URL = process.env.INDEXER_URL
const RPC_API_KEY = process.env.RPC_API_KEY

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!RPC_API_KEY) throw new Error('RPC_API_KEY env var not set')

export const axiosNoRetry = axios.create({ timeout: 5000, params: { 'api-key': RPC_API_KEY } })

// Amounts to ~1 minutes worth of potential retries to account for logsSubscribe "confirmed" commit level
// and /transactions only returning "finalized" transactions. The "confirmed" commit level is required for logsSubscribe
// because "finalized" commit level is not stable and misses logs frequently.
export const axiosWithRetry = createAxiosRetry(
  { retries: 6, delayFactor: 1000 },
  { timeout: 10000, params: { 'api-key': RPC_API_KEY } }
)

export const getTransaction = async (txid: string, shouldRetry?: boolean, retryCount = 0): Promise<Tx> => {
  try {
    const axiosInstance = shouldRetry ? axiosWithRetry : axiosNoRetry

    const { data } = await axiosInstance.post<EnrichedTransaction[]>(`${INDEXER_URL}/v0/transactions/`, {
      transactions: [txid],
    })

    const tx = data[0]

    if (!tx) {
      if (!shouldRetry || ++retryCount >= 5) throw new Error('Transaction not found')
      await exponentialDelay(retryCount)
      return getTransaction(txid, true, retryCount)
    }

    return {
      txid: tx.signature,
      blockHeight: tx.slot,
      ...tx,
      events: {
        compressed: tx.events.compressed ?? null,
        nft: tx.events.nft ?? null,
        swap: tx.events.swap ?? null,
      },
    }
  } catch (err) {
    throw handleError(err)
  }
}
