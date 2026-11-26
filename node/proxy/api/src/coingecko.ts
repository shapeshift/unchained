import { Logger } from '@shapeshiftoss/logger'
import axios, { AxiosResponse, isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'
import { CachedResponse, MB, ResponseCache } from './cache'
import { Route, params, toUpstreamRequest } from './upstream'
import { relayError, relayHeaders } from './utils'

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY

if (!COINGECKO_API_KEY) throw new Error('COINGECKO_API_KEY env var not set')

const CACHE_TTL_MS = 5 * 60_000
const BASE_URL = 'https://pro-api.coingecko.com/api/v3/'
const PREFIX = '/api/v1/markets'

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// endpoints used by shapeshift clients, with the query params coingecko documents for each
export const ROUTES: ReadonlyArray<Route> = [
  { path: /^coins\/list$/, params: params('include_platform', 'status') },
  { path: /^coins\/list\/new$/, params: params() },
  {
    path: /^coins\/markets$/,
    params: params(
      'vs_currency',
      'ids',
      'names',
      'symbols',
      'include_tokens',
      'category',
      'order',
      'per_page',
      'page',
      'sparkline',
      'price_change_percentage',
      'locale',
      'precision'
    ),
  },
  {
    path: /^coins\/top_gainers_losers$/,
    params: params('vs_currency', 'duration', 'top_coins', 'price_change_percentage'),
  },
  { path: /^search\/trending$/, params: params('show_max') },
  {
    path: /^simple\/price$/,
    params: params(
      'ids',
      'names',
      'symbols',
      'include_tokens',
      'vs_currencies',
      'include_market_cap',
      'include_24hr_vol',
      'include_24hr_change',
      'include_last_updated_at',
      'precision'
    ),
  },
  { path: /^coins\/[^/]+\/contract\/[^/]+$/, params: params() },
  {
    path: /^coins\/[^/]+\/market_chart\/range$/,
    params: params('vs_currency', 'from', 'to', 'interval', 'precision'),
  },
  {
    // single segment ids only; reserved names under coins/ are listed above or not allowed
    path: /^coins\/(?!list$|markets$|top_gainers_losers$|categories$)[^/]+$/,
    params: params(
      'localization',
      'tickers',
      'market_data',
      'community_data',
      'developer_data',
      'sparkline',
      'include_categories_details',
      'dex_pair_format'
    ),
  },
]

// align market chart ranges to buckets matching coingecko's data granularity (5m < 1d, hourly <= 90d, daily beyond)
// so requests for the same chart share a cache entry, and round the end up so the latest data point is included
const normalizeRange = (url: string): { url: string; ttl: number } => {
  const [path, query] = url.split('?')
  if (!path.endsWith('/market_chart/range') || !query) return { url, ttl: CACHE_TTL_MS }

  const params = new URLSearchParams(query)
  const from = Number(params.get('from'))
  const to = Number(params.get('to'))
  if (!from || !to || to <= from) return { url, ttl: CACHE_TTL_MS }

  const span = to - from
  const [bucket, maxSpan] =
    span < DAY ? [5 * MINUTE, DAY - 5 * MINUTE] : span <= 90 * DAY ? [HOUR, 90 * DAY] : [DAY, Infinity]

  // clamp the rounded range so it can't cross into a coarser granularity
  const end = Math.ceil(to / bucket) * bucket
  const start = Math.max(Math.floor(from / bucket) * bucket, end - maxSpan)

  params.set('from', String(start))
  params.set('to', String(end))
  params.sort()

  return { url: `${path}?${params}`, ttl: Math.min(bucket, HOUR) * 1000 }
}

// returns the upstream url (also the cache key) and ttl, or undefined when the request is not allowed
export const normalize = (reqUrl: string): { url: string; ttl: number } | undefined => {
  const request = toUpstreamRequest(reqUrl, PREFIX, ROUTES)
  if (!request) return
  return normalizeRange(request.url)
}

export class CoinGecko {
  private logger: Logger
  private axiosInstance: Axios
  private requestCache: ResponseCache
  private inflight = new Map<string, Promise<CachedResponse>>()

  constructor(logger: Logger) {
    this.logger = logger.child({ namespace: ['coingecko'] })
    // coins/list with platforms is the largest body clients fetch, at several megabytes
    this.requestCache = new ResponseCache({ maxBytes: 128 * MB, maxEntryBytes: 32 * MB })
    this.axiosInstance = axios.create({
      timeout: 10_000,
      maxContentLength: 64 * MB,
      // keep raw bodies so cached responses are served without re-serializing
      responseType: 'arraybuffer',
      headers: {
        'x-cg-pro-api-key': COINGECKO_API_KEY,
      },
    })
  }

  async handler(req: Request, res: Response): Promise<void> {
    const normalized = normalize(req.url)

    if (!normalized) {
      res.locals.unrouted = true
      res.status(404).send('Not Found')
      return
    }

    const { url, ttl } = normalized

    const cached = this.requestCache.get(url)
    if (cached) {
      relayHeaders(res, cached.headers)
      res.set('X-Cache', 'HIT').status(cached.status).send(cached.data)
      return
    }

    res.set('X-Cache', 'MISS')

    try {
      // concurrent misses for the same url share a single upstream request
      let request = this.inflight.get(url)
      if (!request) {
        request = this.fetch(url, ttl).finally(() => this.inflight.delete(url))
        this.inflight.set(url, request)
      }

      const response = await request

      relayHeaders(res, response.headers)
      res.status(response.status).send(response.data)
    } catch (err) {
      relayError(res, err, this.logger)
    }
  }

  private async fetch(url: string, ttl: number): Promise<CachedResponse> {
    const cache = ({ status, headers, data }: AxiosResponse<Buffer>): CachedResponse => {
      const response = { status, headers, data }
      this.requestCache.set(url, response, ttl)
      return response
    }

    try {
      return cache(await this.axiosInstance.get<Buffer>(`${BASE_URL}${url}`))
    } catch (err) {
      // unknown coins/contracts are stable, so cache not found responses to avoid repeat upstream calls
      if (isAxiosError<Buffer>(err) && err.response?.status === 404) return cache(err.response)

      throw err
    }
  }
}
