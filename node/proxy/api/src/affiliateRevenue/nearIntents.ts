import axios from 'axios'
import { Fees } from '.'
import {
  BITCOIN_CHAIN_ID,
  DOGECOIN_CHAIN_ID,
  SLIP44,
  SOLANA_CHAIN_ID,
  SUI_CHAIN_ID,
  TRON_CHAIN_ID,
  ZCASH_CHAIN_ID,
} from './constants'

const NEAR_INTENTS_API_KEY = process.env.NEAR_INTENTS_API_KEY

if (!NEAR_INTENTS_API_KEY) throw new Error('NEAR_INTENTS_API_KEY env var not set')

const NEAR_INTENTS_TO_CHAIN_ID: Record<string, string> = {
  eth: 'eip155:1',
  arb: 'eip155:42161',
  base: 'eip155:8453',
  gnosis: 'eip155:100',
  bsc: 'eip155:56',
  pol: 'eip155:137',
  avax: 'eip155:43114',
  op: 'eip155:10',
  btc: BITCOIN_CHAIN_ID,
  doge: DOGECOIN_CHAIN_ID,
  zec: ZCASH_CHAIN_ID,
  sol: SOLANA_CHAIN_ID,
  tron: TRON_CHAIN_ID,
  sui: SUI_CHAIN_ID,
  monad: 'eip155:143',
}

const SLIP44_BY_NETWORK: Record<string, number> = {
  btc: SLIP44.BITCOIN,
  doge: SLIP44.DOGECOIN,
  zec: SLIP44.ZCASH,
  sol: SLIP44.SOLANA,
  tron: SLIP44.TRON,
  sui: SLIP44.SUI,
}

const parseNearIntentsAsset = (asset: string): { chainId: string; assetId: string } | null => {
  const match = asset.match(/^nep141:(.+)\.omft\.near$/)
  if (!match) return null

  const assetPart = match[1]
  const tokenMatch = assetPart.match(/^([a-z]+)-0x([a-f0-9]+)$/i)

  if (tokenMatch) {
    const network = tokenMatch[1]
    const tokenAddress = `0x${tokenMatch[2]}`
    const chainId = NEAR_INTENTS_TO_CHAIN_ID[network]
    if (!chainId) return null

    if (chainId.startsWith('eip155:')) {
      return { chainId, assetId: `${chainId}/erc20:${tokenAddress}` }
    }
    return { chainId, assetId: `${chainId}/slip44:${SLIP44_BY_NETWORK[network] ?? 0}` }
  }

  const network = assetPart
  const chainId = NEAR_INTENTS_TO_CHAIN_ID[network]
  if (!chainId) return null

  if (chainId.startsWith('eip155:')) {
    return { chainId, assetId: `${chainId}/slip44:${SLIP44.ETHEREUM}` }
  }

  const slip44 = SLIP44_BY_NETWORK[network] ?? 0
  return { chainId, assetId: `${chainId}/slip44:${slip44}` }
}

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
      const parsed = parseNearIntentsAsset(transaction.originAsset)
      if (!parsed) {
        console.warn(`[nearIntents] Could not parse asset: ${transaction.originAsset}`)
        continue
      }

      const { chainId, assetId } = parsed
      const txHash = transaction.originChainTxHashes[0] ?? ''

      for (const appFee of transaction.appFees) {
        fees.push({
          chainId,
          assetId,
          service: 'nearintents',
          txHash,
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
