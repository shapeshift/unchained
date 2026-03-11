import { PublicKey } from '@solana/web3.js'
import axios, { isAxiosError } from 'axios'
import type { Request, Response } from 'express'
import { isAddress } from 'viem'

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY

if (!ALCHEMY_API_KEY) throw new Error('ALCHEMY_API_KEY env var not set')

interface EvmResult {
  name: string
  symbol: string
  decimals: number
  logo: string
}

interface SolanaResult {
  content?: {
    metadata?: { name?: string; symbol?: string }
    links?: { image?: string }
    files?: Array<{ uri?: string; mime?: string }>
  }
  token_info?: { symbol?: string; decimals?: number }
}

interface TokenMetadataPayload {
  name: string
  symbol: string
  decimals: number | null
  logo: string | null
}

interface ChainConfig {
  url: string
  method: string
  params: (tokenAddress: string) => unknown
  parse: (r: unknown) => TokenMetadataPayload
  validateAddress: (tokenAddress: string) => boolean
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const parseEvm = (r: unknown): TokenMetadataPayload => {
  const { name, symbol, decimals, logo } = r as EvmResult
  return { name, symbol, decimals: decimals ?? null, logo: logo ?? null }
}

const parseSolana = (r: unknown): TokenMetadataPayload => {
  const { content, token_info } = r as SolanaResult
  return {
    name: content?.metadata?.name ?? '',
    symbol: content?.metadata?.symbol ?? token_info?.symbol ?? '',
    decimals: token_info?.decimals ?? null,
    logo: content?.links?.image ?? content?.files?.find((f) => f.mime?.startsWith('image/'))?.uri ?? null,
  }
}

const isValidSolanaAddress = (address: string): boolean => {
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  'eip155:1': {
    url: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    method: 'alchemy_getTokenMetadata',
    params: (a) => [a],
    parse: parseEvm,
    validateAddress: isAddress,
  },
  'eip155:10': {
    url: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    method: 'alchemy_getTokenMetadata',
    params: (a) => [a],
    parse: parseEvm,
    validateAddress: isAddress,
  },
  'eip155:137': {
    url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    method: 'alchemy_getTokenMetadata',
    params: (a) => [a],
    parse: parseEvm,
    validateAddress: isAddress,
  },
  'eip155:8453': {
    url: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    method: 'alchemy_getTokenMetadata',
    params: (a) => [a],
    parse: parseEvm,
    validateAddress: isAddress,
  },
  'eip155:42161': {
    url: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    method: 'alchemy_getTokenMetadata',
    params: (a) => [a],
    parse: parseEvm,
    validateAddress: isAddress,
  },
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
    url: `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    method: 'getAsset',
    params: (a) => ({ id: a }),
    parse: parseSolana,
    validateAddress: isValidSolanaAddress,
  },
}

export class TokenMetadata {
  private axiosInstance = axios.create({ timeout: 10_000 })
  private requestCache: Partial<Record<string, TokenMetadataPayload>> = {}

  async handler(req: Request, res: Response): Promise<void> {
    const { chainId, tokenAddress } = req.query

    if (typeof chainId !== 'string' || !chainId) {
      res.status(400).json({ error: 'chainId is required' })
      return
    }

    if (typeof tokenAddress !== 'string' || !tokenAddress) {
      res.status(400).json({ error: 'tokenAddress is required' })
      return
    }

    const config = CHAIN_CONFIGS[chainId]
    if (!config) {
      res.status(422).json({ error: 'Unsupported chainId', supported: Object.keys(CHAIN_CONFIGS) })
      return
    }

    if (!config.validateAddress(tokenAddress)) {
      res.status(422).json({ error: 'Invalid tokenAddress' })
      return
    }

    const cacheKey = `${chainId}:${tokenAddress}`
    const cached = this.requestCache[cacheKey]
    if (cached) {
      res.set('X-Cache', 'HIT').json({ chainId, tokenAddress, ...cached })
      return
    }

    try {
      const { data } = await this.axiosInstance.post(config.url, {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: config.method,
        params: config.params(tokenAddress),
      })

      if (data.error?.message) {
        res.status(502).json({ error: data.error.message })
        return
      }

      const metadata = config.parse(data.result)
      if (!metadata.name && !metadata.symbol) {
        res.status(404).json({ error: 'Token not found' })
        return
      }

      this.requestCache[cacheKey] = metadata
      setTimeout(() => delete this.requestCache[cacheKey], CACHE_TTL_MS)

      res.set('X-Cache', 'MISS').json({ chainId, tokenAddress, ...metadata })
    } catch (err) {
      if (isAxiosError(err)) {
        res.status(502).json({ error: err.message || 'Upstream request failed' })
      } else if (err instanceof Error) {
        res.status(500).json({ error: err.message || 'Internal server error' })
      } else {
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  }
}
