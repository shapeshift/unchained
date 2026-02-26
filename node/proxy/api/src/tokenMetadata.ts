import axios, { isAxiosError } from 'axios'
import type { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'

type TokenMetadataResponse = {
  chainId: string
  tokenAddress: string
  name?: string
  symbol?: string
  decimals?: number
  logo?: string
  source: 'alchemy'
}

const ALCHEMY_NETWORK_BY_CHAIN_ID: Record<string, string> = {
  'eip155:1': 'eth-mainnet',
  'eip155:10': 'opt-mainnet',
  'eip155:137': 'polygon-mainnet',
  'eip155:8453': 'base-mainnet',
  'eip155:42161': 'arb-mainnet',
}

const SOLANA_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const SOLANA_BASE58_MAP = new Map(SOLANA_BASE58_ALPHABET.split('').map((char, index) => [char, index]))
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SOLANA_PUBLIC_KEY_LENGTH = 32

const decodeBase58 = (value: string): Uint8Array | null => {
  if (!value.length) return null

  let decodedValue = 0n

  for (const char of value) {
    const charValue = SOLANA_BASE58_MAP.get(char)
    if (charValue === undefined) return null

    decodedValue = decodedValue * 58n + BigInt(charValue)
  }

  let leadingZeroes = 0
  while (leadingZeroes < value.length && value[leadingZeroes] === '1') {
    leadingZeroes += 1
  }

  const bytes: number[] = []
  while (decodedValue > 0n) {
    bytes.push(Number(decodedValue & 0xffn))
    decodedValue >>= 8n
  }
  bytes.reverse()

  const decoded = new Uint8Array(leadingZeroes + bytes.length)
  decoded.set(bytes, leadingZeroes)

  return decoded
}

const isValidSolanaAddress = (address: string): boolean => {
  if (!SOLANA_ADDRESS_REGEX.test(address)) return false
  const decoded = decodeBase58(address)
  return decoded?.length === SOLANA_PUBLIC_KEY_LENGTH
}

const sendValidationError = (res: Response, details: Record<string, string>): void => {
  res.status(422).json({
    message: 'Validation failed',
    details,
  })
}

export class TokenMetadata {
  private readonly windowMs = 60_000
  private readonly cleanupIntervalMs = this.windowMs
  private nextCleanupAt = Date.now() + this.cleanupIntervalMs
  private readonly maxRequestsPerWindow = (() => {
    const parsed = Number.parseInt(process.env.TOKEN_METADATA_RATE_LIMIT_MAX ?? '60', 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60
  })()
  private readonly requestsByIp = new Map<string, { count: number; resetAt: number }>()

  async handler(req: Request, res: Response): Promise<void> {
    if (this.isRateLimited(req, res)) return

    const chainId = typeof req.query.chainId === 'string' ? req.query.chainId : ''
    const tokenAddress = typeof req.query.tokenAddress === 'string' ? req.query.tokenAddress : ''

    if (!chainId || !tokenAddress) {
      res.status(400).json({
        error: 'Both chainId and tokenAddress query params are required',
      })
      return
    }

    try {
      const metadata = await this.getTokenMetadataByChainId(chainId, tokenAddress, res)
      if (res.headersSent) return

      if (!metadata) {
        res.status(404).json({
          message: 'Token metadata not found',
        })
        return
      }

      res.status(200).json(metadata)
    } catch (err) {
      if (isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json({
          message: err.response?.data?.message ?? err.response?.data?.error ?? err.message,
        })
        return
      }

      if (err instanceof Error) {
        res.status(500).json({ message: err.message })
        return
      }

      res.status(500).json({ message: 'Internal Server Error' })
    }
  }

  private isRateLimited(req: Request, res: Response): boolean {
    const now = Date.now()

    if (now >= this.nextCleanupAt) {
      for (const [ip, state] of this.requestsByIp.entries()) {
        if (state.resetAt <= now) {
          this.requestsByIp.delete(ip)
        }
      }

      this.nextCleanupAt = now + this.cleanupIntervalMs
    }

    const key = req.ip || 'unknown'
    const existing = this.requestsByIp.get(key)

    if (!existing || existing.resetAt <= now) {
      this.requestsByIp.set(key, { count: 1, resetAt: now + this.windowMs })
      return false
    }

    if (existing.count >= this.maxRequestsPerWindow) {
      res.status(429).json({
        error: 'Too many requests, please try again later',
      })
      return true
    }

    existing.count += 1
    this.requestsByIp.set(key, existing)
    return false
  }

  private async getTokenMetadataByChainId(
    chainId: string,
    tokenAddress: string,
    res: Response,
  ): Promise<TokenMetadataResponse | null> {
    if (chainId.startsWith('eip155:')) {
      const network = ALCHEMY_NETWORK_BY_CHAIN_ID[chainId]
      if (!network) {
        sendValidationError(res, {
          chainId: `Unsupported chainId: ${chainId}`,
        })
        return null
      }

      if (!isAddress(tokenAddress, { strict: false })) {
        sendValidationError(res, {
          tokenAddress: 'Invalid EVM token address',
        })
        return null
      }

      const metadata = await this.getEvmTokenMetadata(chainId, network, getAddress(tokenAddress))
      return metadata
    }

    if (chainId.startsWith('solana:')) {
      if (!isValidSolanaAddress(tokenAddress)) {
        sendValidationError(res, {
          tokenAddress: 'Invalid Solana mint address',
        })
        return null
      }

      const metadata = await this.getSolanaTokenMetadata(chainId, tokenAddress)
      return metadata
    }

    sendValidationError(res, {
      chainId: `Unsupported chainId: ${chainId}`,
    })
    return null
  }

  private async getEvmTokenMetadata(
    chainId: string,
    network: string,
    tokenAddress: string,
  ): Promise<TokenMetadataResponse | null> {
    const apiKey = process.env.ALCHEMY_API_KEY
    if (!apiKey) throw new Error('ALCHEMY_API_KEY env var not set')

    const url = `https://${network}.g.alchemy.com/v2/${apiKey}`
    const response = await axios.post<{
      result?: {
        name?: string
        symbol?: string
        decimals?: number | string
        logo?: string
      }
      error?: { message?: string }
    }>(
      url,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenMetadata',
        params: [tokenAddress],
      },
      {
        timeout: 10_000,
      },
    )

    if (response.data.error?.message) throw new Error(response.data.error.message)

    const result = response.data.result
    if (!result) return null

    const decimals = result.decimals === undefined ? undefined : Number(result.decimals)

    return {
      chainId,
      tokenAddress,
      name: result.name,
      symbol: result.symbol,
      decimals: Number.isFinite(decimals) ? decimals : undefined,
      logo: result.logo,
      source: 'alchemy',
    }
  }

  private async getSolanaTokenMetadata(
    chainId: string,
    tokenAddress: string,
  ): Promise<TokenMetadataResponse | null> {
    const alchemyApiKey = process.env.ALCHEMY_API_KEY
    const alchemySolanaRpcUrl =
      process.env.ALCHEMY_SOLANA_RPC_URL ??
      (alchemyApiKey ? `https://solana-mainnet.g.alchemy.com/v2/${alchemyApiKey}` : undefined)

    if (!alchemySolanaRpcUrl) throw new Error('ALCHEMY_SOLANA_RPC_URL or ALCHEMY_API_KEY env var not set')

    const response = await axios.post<{
      result?: {
        token_info?: {
          decimals?: number
          symbol?: string
        }
        content?: {
          metadata?: {
            name?: string
            symbol?: string
          }
          links?: {
            image?: string
          }
          files?: Array<{
            uri?: string
          }>
        }
      }
      error?: { message?: string }
    }>(
      alchemySolanaRpcUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getAsset',
        params: {
          id: tokenAddress,
        },
      },
      {
        timeout: 10_000,
      },
    )

    if (response.data.error?.message) throw new Error(response.data.error.message)

    const result = response.data.result
    if (!result) return null

    const name = result.content?.metadata?.name
    const symbol = result.token_info?.symbol ?? result.content?.metadata?.symbol
    const decimals = result.token_info?.decimals
    const logo = result.content?.links?.image ?? result.content?.files?.[0]?.uri

    return {
      chainId,
      tokenAddress,
      name,
      symbol,
      decimals,
      logo,
      source: 'alchemy',
    }
  }
}
