import axios from 'axios'
import { decodeAbiParameters, zeroAddress } from 'viem'
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

  try {
    if (explorerType === 'blockscout') {
      const { data } = await axios.get<{ decimals?: string }>(`${explorerUrl}/api/v2/tokens/${tokenAddress}`)
      return parseInt(data.decimals ?? '18')
    }

    const { data } = await axios.get<{ result?: Array<{ divisor?: string }> }>(`${explorerUrl}/api`, {
      params: { module: 'token', action: 'tokeninfo', contractaddress: tokenAddress },
    })
    return parseInt(data.result?.[0]?.divisor ?? '18')
  } catch {
    return 18
  }
}

export const buildAssetId = (chainId: string, tokenAddress: string): string => {
  const tokenLower = tokenAddress.toLowerCase()
  const isNative = tokenLower === zeroAddress
  return isNative ? `${chainId}/slip44:${SLIP44.ETHEREUM}` : `${chainId}/erc20:${tokenLower}`
}

export const getTokenPrice = async (chainId: string, tokenAddress: string): Promise<number | null> => {
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
      return data[chainConfig.nativeCoinId]?.usd ?? null
    }

    const { data } = await axios.get<{ market_data?: { current_price?: { usd?: number } } }>(
      `${COINGECKO_API_BASE}/coins/${chainConfig.platform}/contract/${tokenLower}`
    )
    return data.market_data?.current_price?.usd ?? null
  } catch {
    return null
  }
}
