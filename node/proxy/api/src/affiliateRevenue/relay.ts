import axios from 'axios'
import { Fees } from '.'
import {
  BITCOIN_CHAIN_ID,
  DAO_TREASURY_BASE,
  SLIP44,
  SOLANA_CHAIN_ID,
  TRON_CHAIN_ID,
} from './constants'

const RELAY_API_URL = 'https://api.relay.link'
const SHAPESHIFT_REFERRER = 'shapeshift'

// Non-EVM chains need explicit CAIP-2 chain ID mapping
// EVM chains automatically use eip155:${chainId} pattern
const NON_EVM_CHAINS: Record<number, { chainId: string; slip44: number }> = {
  792703809: { chainId: SOLANA_CHAIN_ID, slip44: SLIP44.SOLANA }, // Solana
  8253038: { chainId: BITCOIN_CHAIN_ID, slip44: SLIP44.BITCOIN }, // Bitcoin
  728126428: { chainId: TRON_CHAIN_ID, slip44: SLIP44.TRON }, // Tron
  // Eclipse and Soon don't have canonical CAIP IDs yet - keep as placeholders
  9286185: { chainId: 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z', slip44: SLIP44.SOLANA }, // Eclipse (SVM)
  9286186: { chainId: 'solana:soon', slip44: SLIP44.SOLANA }, // Soon (SVM)
}

type AppFee = {
  recipient: string
  bps: string
  amount: string
  amountUsd: string
  amountUsdCurrent?: string
}

type CurrencyObject = {
  chainId: number
  address: string
  symbol: string
  name: string
  decimals: number
}

type InTx = {
  chainId: number
  hash: string
  timestamp: number
}

type RequestData = {
  appFees?: AppFee[]
  paidAppFees?: AppFee[]
  feeCurrencyObject?: CurrencyObject
  inTxs?: InTx[]
  metadata?: {
    currencyIn?: {
      currency?: CurrencyObject
    }
  }
}

type RelayRequest = {
  id: string
  status: string
  user: string
  recipient: string
  createdAt: string
  updatedAt: string
  data: RequestData
}

type RelayResponse = {
  requests: RelayRequest[]
  continuation?: string
}

const isLikelyNonEvm = (chainId: number): boolean => {
  // Non-EVM chains in Relay typically have very large chain IDs (>1M)
  // EVM chains are typically < 1M
  return chainId > 1_000_000
}

const getChainConfig = (numericChainId: number): { chainId: string; slip44: number; isEvm: boolean } => {
  const nonEvmConfig = NON_EVM_CHAINS[numericChainId]
  if (nonEvmConfig) {
    return { ...nonEvmConfig, isEvm: false }
  }

  // For unknown chains with large IDs (likely non-EVM), use a generic format
  // This ensures we still capture fees even for chains we don't explicitly support
  if (isLikelyNonEvm(numericChainId)) {
    return {
      chainId: `unknown:${numericChainId}`,
      slip44: 0,
      isEvm: false,
    }
  }

  // Default to EVM chain (small chain IDs are typically EVM)
  return {
    chainId: `eip155:${numericChainId}`,
    slip44: 60,
    isEvm: true,
  }
}

const buildAssetId = (
  chainId: string,
  slip44: number,
  tokenAddress: string,
  isEvm: boolean
): string => {
  const normalizedAddress = tokenAddress.toLowerCase()
  const isNativeToken =
    normalizedAddress === '0x0000000000000000000000000000000000000000' ||
    normalizedAddress === '11111111111111111111111111111111' // Solana native

  if (isNativeToken) {
    return `${chainId}/slip44:${slip44}`
  }

  if (isEvm) {
    return `${chainId}/erc20:${normalizedAddress}`
  }

  // For non-EVM tokens, fall back to native slip44
  return `${chainId}/slip44:${slip44}`
}

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
