import axios from 'axios'
import { decodeAbiParameters, zeroAddress } from 'viem'
import { getCachedDecimals, saveCachedDecimals } from '../cache'
import { SLIP44 } from '../constants'
import { AFFILIATE_FEE_BPS, COINGECKO_API_BASE, COINGECKO_CHAINS, FEE_BPS_DENOMINATOR, PORTAL_EVENT_ABI } from './constants'
import type { BlockscoutTransaction, DecodedPortalEvent, ExplorerType } from './types'

export const getTransactionTimestamp = async (explorerUrl: string, txHash: string): Promise<number> => {
  const url = `${explorerUrl}/api/v2/transactions/${txHash}`
  const { data } = await axios.get<BlockscoutTransaction>(url)
  return Math.floor(new Date(data.timestamp).getTime() / 1000)
}

export const decodePortalEventData = (data: string): DecodedPortalEvent | null => {
  if (!data || data.length < 258) return null

  try {
    const decoded = decodeAbiParameters(PORTAL_EVENT_ABI, data as `0x${string}`)
    return {
      inputToken: decoded[0],
      inputAmount: decoded[1].toString(),
      outputToken: decoded[2],
      outputAmount: decoded[3].toString(),
    }
  } catch {
    return null
  }
}

export const calculateFallbackFee = (inputAmount: string): string => {
  const amount = BigInt(inputAmount)
  const fee = (amount * BigInt(AFFILIATE_FEE_BPS)) / BigInt(FEE_BPS_DENOMINATOR)
  return fee.toString()
}

export const getTokenDecimals = async (
  explorerUrl: string,
  explorerType: ExplorerType,
  tokenAddress: string
): Promise<number> => {
  if (tokenAddress.toLowerCase() === zeroAddress) return 18

  const cacheKey = `${explorerUrl}:${tokenAddress.toLowerCase()}`
  const cached = getCachedDecimals(cacheKey)
  if (cached !== undefined) return cached

  try {
    if (explorerType === 'blockscout') {
      const { data } = await axios.get<{ decimals?: string }>(`${explorerUrl}/api/v2/tokens/${tokenAddress}`)
      const decimals = parseInt(data.decimals ?? '18')
      saveCachedDecimals(cacheKey, decimals)
      return decimals
    }

    const { data } = await axios.get<{ result?: Array<{ divisor?: string }> }>(`${explorerUrl}/api`, {
      params: { module: 'token', action: 'tokeninfo', contractaddress: tokenAddress },
    })
    const decimals = parseInt(data.result?.[0]?.divisor ?? '18')
    saveCachedDecimals(cacheKey, decimals)
    return decimals
  } catch {
    saveCachedDecimals(cacheKey, 18)
    return 18
  }
}

export const buildAssetId = (chainId: string, tokenAddress: string): string => {
  const tokenLower = tokenAddress.toLowerCase()
  const isNative = tokenLower === zeroAddress
  return isNative ? `${chainId}/slip44:${SLIP44.ETHEREUM}` : `${chainId}/erc20:${tokenLower}`
}

const priceCache: Record<string, { price: number | null; timestamp: number }> = {}
const PRICE_CACHE_TTL = 1000 * 60 * 5 // 5 minutes

export const getTokenPrice = async (chainId: string, tokenAddress: string): Promise<number | null> => {
  const cacheKey = `${chainId}:${tokenAddress.toLowerCase()}`
  const cached = priceCache[cacheKey]
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price
  }

  try {
    const networkId = chainId.split(':')[1]
    const chainConfig = COINGECKO_CHAINS[networkId]
    if (!chainConfig) return null

    const tokenLower = tokenAddress.toLowerCase()
    const isNative = tokenLower === zeroAddress

    if (isNative) {
      const { data } = await axios.get<Record<string, { usd: number }>>(
        `${COINGECKO_API_BASE}/simple/price`,
        { params: { vs_currencies: 'usd', ids: chainConfig.nativeCoinId } }
      )
      const price = data[chainConfig.nativeCoinId]?.usd ?? null
      priceCache[cacheKey] = { price, timestamp: Date.now() }
      return price
    }

    const { data } = await axios.get<{ market_data?: { current_price?: { usd?: number } } }>(
      `${COINGECKO_API_BASE}/coins/${chainConfig.platform}/contract/${tokenLower}`
    )
    const price = data.market_data?.current_price?.usd ?? null
    priceCache[cacheKey] = { price, timestamp: Date.now() }
    return price
  } catch {
    priceCache[cacheKey] = { price: null, timestamp: Date.now() }
    return null
  }
}
