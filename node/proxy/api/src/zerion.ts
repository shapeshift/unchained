import { Logger } from '@shapeshiftoss/logger'
import axios, { isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'
import { MB, ResponseCache } from './cache'
import { Route, params, toUpstreamRequest } from './upstream'
import { relayError, relayHeaders } from './utils'

const ZERION_API_KEY = process.env.ZERION_API_KEY

if (!ZERION_API_KEY) throw new Error('ZERION_API_KEY env var not set')

const CACHE_TTL_MS = 60_000
const UNKNOWN_CACHE_TTL_MS = 24 * 60 * 60_000
const MAX_UNKNOWN_CACHE_ENTRIES = 50_000
const MAX_FUNGIBLE_CACHE_ENTRIES = 50_000
const MAX_IMPLEMENTATIONS = 25
const IMPLEMENTATIONS_FILTER = 'filter[fungible_implementations]'
const BASE_URL = 'https://api.zerion.io/v1/'
const PREFIX = '/api/v1/zerion'

// endpoints used by shapeshift clients, with the query params zerion documents for each
export const ROUTES: ReadonlyArray<Route> = [
  {
    path: /^fungibles$/,
    params: params(
      'currency',
      'page[after]',
      'page[before]',
      'page[size]',
      'filter[search_query]',
      'filter[implementation_chain_id]',
      'filter[implementation_address]',
      'filter[fungible_ids]',
      IMPLEMENTATIONS_FILTER,
      'sort'
    ),
  },
  {
    path: /^fungibles\/[^/]+\/charts\/(hour|day|week|month|3months|6months|year|5years|max)$/,
    params: params('currency'),
  },
]

type Fungible = {
  id: string
  attributes: { implementations: Array<{ chain_id: string; address: string | null }> }
}

type FungibleCache = Map<string, { fungible: Fungible; expires: number }>
type UnknownCache = Map<string, number>

const toImplementationKey = (chainId: string, address: string): string =>
  `${chainId}:${address.startsWith('0x') ? address.toLowerCase() : address}`

export class Zerion {
  private logger: Logger
  private axiosInstance: Axios
  private requestCache: ResponseCache
  private fungibleCache: FungibleCache
  private unknownCache: UnknownCache

  constructor(logger: Logger) {
    this.logger = logger.child({ namespace: ['zerion'] })
    this.requestCache = new ResponseCache({ maxBytes: 64 * MB, maxEntryBytes: 4 * MB })
    this.fungibleCache = new Map()
    this.unknownCache = new Map()
    this.axiosInstance = axios.create({
      timeout: 10_000,
      maxContentLength: 16 * MB,
      // keep raw bodies so cached responses are served without re-serializing
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Basic ${ZERION_API_KEY}`,
      },
    })

    setInterval(() => {
      const now = Date.now()
      this.fungibleCache.forEach(({ expires }, key) => expires <= now && this.fungibleCache.delete(key))
      this.unknownCache.forEach((expires, key) => expires <= now && this.unknownCache.delete(key))
    }, 60_000).unref()
  }

  async handler(req: Request, res: Response): Promise<void> {
    const implementations = this.getImplementations(req)
    if (implementations) return this.handleImplementations(implementations, res)

    const request = toUpstreamRequest(req.url, PREFIX, ROUTES)

    if (!request) {
      res.locals.unrouted = true
      res.status(404).send('Not Found')
      return
    }

    const { url } = request

    const cached = this.requestCache.get(url)
    if (cached) {
      relayHeaders(res, cached.headers)
      res.set('X-Cache', 'HIT').status(cached.status).send(cached.data)
      return
    }

    res.set('X-Cache', 'MISS')

    try {
      const { status, headers, data } = await this.axiosInstance.get<Buffer>(`${BASE_URL}${url}`)
      this.requestCache.set(url, { status, headers, data }, CACHE_TTL_MS)
      relayHeaders(res, headers)
      res.status(status).send(data)
    } catch (err) {
      relayError(res, err, this.logger)
    }
  }

  private getImplementations(req: Request): Array<string> | undefined {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost')

    if (pathname !== '/api/v1/zerion/fungibles') return
    if ([...searchParams.keys()].join() !== IMPLEMENTATIONS_FILTER) return

    const pairs = (searchParams.get(IMPLEMENTATIONS_FILTER) ?? '').split(',')

    // oversized or malformed lookups go to zerion as is, so it returns its own validation error
    if (pairs.length > MAX_IMPLEMENTATIONS) return

    const implementations = new Set<string>()
    for (const pair of pairs) {
      const [chainId, ...rest] = pair.trim().split(':')
      const address = rest.join(':')
      if (!chainId || !address) return
      implementations.add(toImplementationKey(chainId, address))
    }

    return [...implementations]
  }

  private async handleImplementations(implementations: Array<string>, res: Response): Promise<void> {
    const now = Date.now()
    const results = new Map<string, Fungible>()
    const misses: Array<string> = []

    for (const implementation of implementations) {
      const cached = this.fungibleCache.get(implementation)
      if (cached && cached.expires > now) {
        results.set(implementation, cached.fungible)
      } else if ((this.unknownCache.get(implementation) ?? 0) <= now) {
        misses.push(implementation)
      }
    }

    if (misses.length) {
      try {
        const found = await this.fetchFungibles(misses)
        found.forEach((fungible, implementation) => results.set(implementation, fungible))
      } catch (err) {
        return relayError(res, err, this.logger)
      }
    }

    // one fungible can cover several requested implementations (e.g. usdc on base and arbitrum)
    const fungibles = new Map<string, Fungible>()
    for (const implementation of implementations) {
      const fungible = results.get(implementation)
      if (fungible) fungibles.set(fungible.id, fungible)
    }

    res.set('X-Cache', misses.length ? 'MISS' : 'HIT').json({ data: [...fungibles.values()] })
  }

  private async fetchFungibles(implementations: Array<string>): Promise<Map<string, Fungible>> {
    const fungibles = await this.axiosInstance
      .get<{ data: Array<Fungible> }>(`${BASE_URL}fungibles`, {
        params: { [IMPLEMENTATIONS_FILTER]: implementations.join(',') },
        responseType: 'json',
      })
      .then(({ data }) => data.data)
      // zerion answers 404 instead of an empty list when none of the implementations are known
      .catch((err) => {
        if (isAxiosError(err) && err.response?.status === 404) return []
        throw err
      })

    const found = new Map<string, Fungible>()
    for (const fungible of fungibles) {
      for (const { chain_id, address } of fungible.attributes.implementations) {
        if (address) found.set(toImplementationKey(chain_id, address), fungible)
      }
    }

    // every implementation of a found fungible is cached, so lookups on its other chains hit too
    const expires = Date.now() + CACHE_TTL_MS
    found.forEach((fungible, implementation) => {
      this.cacheFungible(implementation, fungible, expires)
      this.unknownCache.delete(implementation)
    })
    implementations.forEach((implementation) => !found.has(implementation) && this.cacheUnknown(implementation))

    return found
  }

  private cacheFungible(implementation: string, fungible: Fungible, expires: number): void {
    this.fungibleCache.delete(implementation)

    // drops the oldest entry when full, like the unknown cache
    if (this.fungibleCache.size >= MAX_FUNGIBLE_CACHE_ENTRIES) {
      const [oldest] = this.fungibleCache.keys()
      this.fungibleCache.delete(oldest)
    }

    this.fungibleCache.set(implementation, { fungible, expires })
  }

  private cacheUnknown(implementation: string): void {
    this.unknownCache.delete(implementation)

    // drops the oldest entry when full, so junk lookups can't keep new unknowns out
    if (this.unknownCache.size >= MAX_UNKNOWN_CACHE_ENTRIES) {
      const [oldest] = this.unknownCache.keys()
      this.unknownCache.delete(oldest)
    }

    this.unknownCache.set(implementation, Date.now() + UNKNOWN_CACHE_TTL_MS)
  }
}
