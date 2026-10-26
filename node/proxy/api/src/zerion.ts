import axios, { AxiosResponse, isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'

const ZERION_API_KEY = process.env.ZERION_API_KEY

if (!ZERION_API_KEY) throw new Error('ZERION_API_KEY env var not set')

const CACHE_TTL_MS = 60_000
const UNKNOWN_CACHE_TTL_MS = 24 * 60 * 60_000
const MAX_UNKNOWN_CACHE_ENTRIES = 50_000
const MAX_IMPLEMENTATIONS = 25
const IMPLEMENTATIONS_FILTER = 'filter[fungible_implementations]'
const BASE_URL = 'https://api.zerion.io/v1/'

type CachedResponse = Pick<AxiosResponse<Buffer>, 'status' | 'headers' | 'data'>
type RequestCache = Map<string, { response: CachedResponse; expires: number }>

type Fungible = {
  id: string
  attributes: { implementations: Array<{ chain_id: string; address: string | null }> }
}

type FungibleCache = Map<string, { fungible: Fungible; expires: number }>
type UnknownCache = Map<string, number>

const toImplementationKey = (chainId: string, address: string): string =>
  `${chainId}:${address.startsWith('0x') ? address.toLowerCase() : address}`

export class Zerion {
  private axiosInstance: Axios
  private requestCache: RequestCache
  private fungibleCache: FungibleCache
  private unknownCache: UnknownCache

  constructor() {
    this.requestCache = new Map()
    this.fungibleCache = new Map()
    this.unknownCache = new Map()
    this.axiosInstance = axios.create({
      // keep raw bodies so cached responses are served without re-serializing
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Basic ${ZERION_API_KEY}`,
      },
    })

    setInterval(() => {
      const now = Date.now()
      this.requestCache.forEach(({ expires }, key) => expires <= now && this.requestCache.delete(key))
      this.fungibleCache.forEach(({ expires }, key) => expires <= now && this.fungibleCache.delete(key))
      this.unknownCache.forEach((expires, key) => expires <= now && this.unknownCache.delete(key))
    }, 60_000)
  }

  async handler(req: Request, res: Response): Promise<void> {
    const implementations = this.getImplementations(req)
    if (implementations) return this.handleImplementations(implementations, res)

    const url = req.url.substring('/api/v1/zerion/'.length)

    const cached = this.requestCache.get(req.url)
    if (cached && cached.expires > Date.now()) {
      Object.entries(cached.response.headers).forEach(([k, v]) => res.set(k, v))
      res.set('X-Cache', 'HIT').status(cached.response.status).send(cached.response.data)
      return
    }

    res.set('X-Cache', 'MISS')

    try {
      const { status, headers, data } = await this.axiosInstance.get<Buffer>(`${BASE_URL}${url}`)
      this.requestCache.set(req.url, { response: { status, headers, data }, expires: Date.now() + CACHE_TTL_MS })
      Object.entries(headers).forEach(([k, v]) => res.set(k, v))
      res.status(status).send(data)
    } catch (err) {
      this.sendError(res, err)
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
        return this.sendError(res, err)
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
    found.forEach((fungible, implementation) => this.fungibleCache.set(implementation, { fungible, expires }))
    implementations.forEach((implementation) => !found.has(implementation) && this.cacheUnknown(implementation))

    return found
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

  private sendError(res: Response, err: unknown): void {
    if (isAxiosError(err)) {
      const contentType = err.response?.headers['content-type']
      if (typeof contentType === 'string') res.type(contentType)
      res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
    } else if (err instanceof Error) {
      res.status(500).send(err.message || 'Internal Server Error')
    } else {
      res.status(500).send('Internal Server Error')
    }
  }
}
