import {
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  DAO_TREASURY_ARBITRUM,
  DAO_TREASURY_AVALANCHE,
  DAO_TREASURY_BASE,
  DAO_TREASURY_BSC,
  DAO_TREASURY_ETHEREUM,
  DAO_TREASURY_GNOSIS,
  DAO_TREASURY_OPTIMISM,
  DAO_TREASURY_POLYGON,
  ETHEREUM_CHAIN_ID,
  GNOSIS_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  POLYGON_CHAIN_ID,
} from '../constants'
import type { ChainConfig } from './types'

export const AFFILIATE_FEE_BPS = 55
export const FEE_BPS_DENOMINATOR = 10000

export const PORTAL_EVENT_SIGNATURE = '0x5915121a82fd755e41c1e456ef88c033de2bce9c1293024de10dddb0e2f4a101'
export const PORTAL_EVENT_ABI = [
  { type: 'address', name: 'inputToken' },
  { type: 'uint256', name: 'inputAmount' },
  { type: 'address', name: 'outputToken' },
  { type: 'uint256', name: 'outputAmount' },
  { type: 'address', name: 'recipient' },
] as const

export const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId: ETHEREUM_CHAIN_ID,
    network: 'ethereum',
    router: '0xbf5a7f3629fb325e2a8453d595ab103465f75e62',
    treasury: DAO_TREASURY_ETHEREUM,
    explorerType: 'blockscout',
    explorerUrl: 'https://eth.blockscout.com',
  },
  {
    chainId: ARBITRUM_CHAIN_ID,
    network: 'arbitrum',
    router: '0x34b6a821d2f26c6b7cdb01cd91895170c6574a0d',
    treasury: DAO_TREASURY_ARBITRUM,
    explorerType: 'blockscout',
    explorerUrl: 'https://arbitrum.blockscout.com',
  },
  {
    chainId: OPTIMISM_CHAIN_ID,
    network: 'optimism',
    router: '0x43838f0c0d499f5c3101589f0f452b1fc7515178',
    treasury: DAO_TREASURY_OPTIMISM,
    explorerType: 'blockscout',
    explorerUrl: 'https://optimism.blockscout.com',
  },
  {
    chainId: BASE_CHAIN_ID,
    network: 'base',
    router: '0xb0324286b3ef7dddc93fb2ff7c8b7b8a3524803c',
    treasury: DAO_TREASURY_BASE,
    explorerType: 'blockscout',
    explorerUrl: 'https://base.blockscout.com',
  },
  {
    chainId: POLYGON_CHAIN_ID,
    network: 'polygon',
    router: '0xC74063fdb47fe6dCE6d029A489BAb37b167Da57f',
    treasury: DAO_TREASURY_POLYGON,
    explorerType: 'blockscout',
    explorerUrl: 'https://polygon.blockscout.com',
  },
  {
    chainId: GNOSIS_CHAIN_ID,
    network: 'gnosis',
    router: '0x8e74454b2cf2f6cc2a06083ef122187551cf391c',
    treasury: DAO_TREASURY_GNOSIS,
    explorerType: 'blockscout',
    explorerUrl: 'https://gnosis.blockscout.com',
  },
  {
    chainId: BSC_CHAIN_ID,
    network: 'bsc',
    router: '0x34b6a821d2f26c6b7cdb01cd91895170c6574a0d',
    treasury: DAO_TREASURY_BSC,
    explorerType: 'etherscan',
    explorerUrl: 'https://api.bscscan.com',
  },
  {
    chainId: AVALANCHE_CHAIN_ID,
    network: 'avalanche',
    router: '0xbf5A7F3629fB325E2a8453D595AB103465F75E62',
    treasury: DAO_TREASURY_AVALANCHE,
    explorerType: 'etherscan',
    explorerUrl: 'https://api.snowtrace.io',
  },
]

export const COINGECKO_CHAINS: Record<string, { platform: string; nativeCoinId: string }> = {
  '1': { platform: 'ethereum', nativeCoinId: 'ethereum' },
  '42161': { platform: 'arbitrum-one', nativeCoinId: 'ethereum' },
  '10': { platform: 'optimistic-ethereum', nativeCoinId: 'ethereum' },
  '8453': { platform: 'base', nativeCoinId: 'ethereum' },
  '137': { platform: 'polygon-pos', nativeCoinId: 'matic-network' },
  '100': { platform: 'xdai', nativeCoinId: 'xdai' },
  '56': { platform: 'binance-smart-chain', nativeCoinId: 'binancecoin' },
  '43114': { platform: 'avalanche', nativeCoinId: 'avalanche-2' },
}

export const COINGECKO_API_BASE = 'https://api.proxy.shapeshift.com/api/v1/markets'
