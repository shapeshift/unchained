import { SLIP44 } from '../constants'
import { NEAR_INTENTS_TO_CHAIN_ID, SLIP44_BY_NETWORK } from './constants'
import type { ParseResult } from './types'

export const resolveChainId = (network: string): string | undefined => {
  const chainId = NEAR_INTENTS_TO_CHAIN_ID[network]
  if (!chainId) {
    console.warn(`[nearIntents] Unknown network '${network}' - add to NEAR_INTENTS_TO_CHAIN_ID`)
  }
  return chainId
}

export const buildAssetId = (chainId: string, network: string, tokenAddress?: string): string => {
  if (chainId.startsWith('unknown:')) {
    return tokenAddress ? `${chainId}/unknown:${tokenAddress}` : `${chainId}/native`
  }

  if (chainId.startsWith('eip155:')) {
    return tokenAddress ? `${chainId}/erc20:${tokenAddress}` : `${chainId}/slip44:${SLIP44.ETHEREUM}`
  }

  const slip44 = SLIP44_BY_NETWORK[network] ?? 0
  return `${chainId}/slip44:${slip44}`
}

export const parseNearIntentsAsset = (asset: string): ParseResult => {
  const nep141Match = asset.match(/^nep141:(.+)\.omft\.near$/)
  if (nep141Match) {
    const assetPart = nep141Match[1]

    const tokenMatch = assetPart.match(/^([a-z]+)-(0x)?([a-f0-9]+)$/i)
    if (tokenMatch) {
      const network = tokenMatch[1]
      const tokenAddress = `0x${tokenMatch[3]}`
      const chainId = resolveChainId(network) ?? `unknown:${network}`
      return { chainId, assetId: buildAssetId(chainId, network, tokenAddress) }
    }

    const network = assetPart
    const chainId = resolveChainId(network) ?? `unknown:${network}`
    return { chainId, assetId: buildAssetId(chainId, network) }
  }

  const nep141NativeMatch = asset.match(/^nep141:(.+)\.near$/)
  if (nep141NativeMatch) {
    const tokenAddress = nep141NativeMatch[1]
    const chainId = resolveChainId('near') ?? 'near:mainnet'
    return { chainId, assetId: `${chainId}/nep141:${tokenAddress}` }
  }

  const nep245Match = asset.match(/^nep245:v2_1\.omni\.hot\.tg:(\d+)_.+$/)
  if (nep245Match) {
    const chainId = `eip155:${nep245Match[1]}`
    return { chainId, assetId: `${chainId}/slip44:${SLIP44.ETHEREUM}` }
  }

  const prefix = asset.split(':')[0] ?? 'unknown'
  console.warn(`[nearIntents] Unrecognized asset format: ${asset} - update parser`)
  return { chainId: `unknown:${prefix}`, assetId: `unknown:${prefix}/unknown` }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
