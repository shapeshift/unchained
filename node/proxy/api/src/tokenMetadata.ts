import axios, { isAxiosError } from 'axios'
import type { Request, Response } from 'express'

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY
if (!ALCHEMY_API_KEY) console.warn('ALCHEMY_API_KEY env var not set — /api/v1/tokens/metadata will be unavailable')

const ALCHEMY_NETWORK_BY_CHAIN_ID: Record<string, string> = {
  'eip155:1': 'eth-mainnet',
  'eip155:10': 'opt-mainnet',
  'eip155:137': 'polygon-mainnet',
  'eip155:8453': 'base-mainnet',
  'eip155:42161': 'arb-mainnet',
}

const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'

export class TokenMetadata {
  private axiosInstance = axios.create({ timeout: 10_000 })

  async handler(req: Request, res: Response): Promise<void> {
    const chainId = typeof req.query.chainId === 'string' ? req.query.chainId : ''
    const tokenAddress = typeof req.query.tokenAddress === 'string' ? req.query.tokenAddress : ''

    if (!ALCHEMY_API_KEY) {
      res.status(503).json({ error: 'Token metadata service is not configured' })
      return
    }

    if (!chainId || !tokenAddress) {
      res.status(400).json({ error: 'Both chainId and tokenAddress query params are required' })
      return
    }

    try {
      const evmNetwork = ALCHEMY_NETWORK_BY_CHAIN_ID[chainId]

      if (evmNetwork) {
        const { data } = await this.axiosInstance.post(
          `https://${evmNetwork}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
          { jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenMetadata', params: [tokenAddress] },
        )
        if (data.error?.message) {
          res.status(502).json({ error: data.error.message })
          return
        }
        const r = data.result
        if (!r) {
          res.status(404).json({ error: 'Token not found' })
          return
        }
        res.set('Cache-Control', 'public, max-age=86400').json({ chainId, tokenAddress, name: r.name, symbol: r.symbol, decimals: r.decimals, logo: r.logo })
        return
      }

      if (chainId === SOLANA_CHAIN_ID) {
        const { data } = await this.axiosInstance.post(`https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
          jsonrpc: '2.0',
          id: 1,
          method: 'getAsset',
          params: { id: tokenAddress },
        })
        if (data.error?.message) {
          res.status(502).json({ error: data.error.message })
          return
        }
        const r = data.result
        if (!r) {
          res.status(404).json({ error: 'Token not found' })
          return
        }
        res.set('Cache-Control', 'public, max-age=86400').json({
          chainId,
          tokenAddress,
          name: r.content?.metadata?.name,
          symbol: r.token_info?.symbol ?? r.content?.metadata?.symbol,
          decimals: r.token_info?.decimals,
          logo: r.content?.links?.image ?? r.content?.files?.[0]?.uri,
        })
        return
      }

      res.status(422).json({ error: `Unsupported chainId: ${chainId}` })
    } catch (err) {
      if (isAxiosError(err)) {
        res.status(err.response?.status ?? 502).json({ error: 'Upstream request failed' })
        return
      }
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
