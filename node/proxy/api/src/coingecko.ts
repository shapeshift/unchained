import axios, { AxiosResponse, isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY

if (!COINGECKO_API_KEY) throw new Error('COINGECKO_API_KEY env var not set')

const CACHE_TTL_MS = 5 * 60_000
const BASE_URL = 'https://pro-api.coingecko.com/api/v3/'

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// align market chart ranges to buckets matching coingecko's data granularity (5m < 1d, hourly <= 90d, daily beyond)
// so requests for the same chart share a cache entry, and round the end up so the latest data point is included
const normalize = (url: string): { url: string; ttl: number } => {
  const [path, query] = url.split('?')
  if (!path.endsWith('/market_chart/range') || !query) return { url, ttl: CACHE_TTL_MS }

  const params = new URLSearchParams(query)
  const from = Number(params.get('from'))
  const to = Number(params.get('to'))
  if (!from || !to || to <= from) return { url, ttl: CACHE_TTL_MS }

  const span = to - from
  const bucket = span < DAY ? 5 * MINUTE : span <= 90 * DAY ? HOUR : DAY

  params.set('from', String(Math.floor(from / bucket) * bucket))
  params.set('to', String(Math.ceil(to / bucket) * bucket))

  return { url: `${path}?${params}`, ttl: Math.min(bucket, HOUR) * 1000 }
}

type MarketRow = Record<string, unknown> & { id: string; market_cap?: number | null; total_volume?: number | null }

// coingecko's max per_page
const MARKETS_MAX_IDS = 250

const MARKETS_ORDERS: Record<string, (a: MarketRow, b: MarketRow) => number> = {
  market_cap_desc: (a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0),
  market_cap_asc: (a, b) => (a.market_cap ?? 0) - (b.market_cap ?? 0),
  volume_desc: (a, b) => (b.total_volume ?? 0) - (a.total_volume ?? 0),
  volume_asc: (a, b) => (a.total_volume ?? 0) - (b.total_volume ?? 0),
  id_desc: (a, b) => b.id.localeCompare(a.id),
  id_asc: (a, b) => a.id.localeCompare(b.id),
}

// params that shape a row's contents, so rows are shared between requests with the same values
const MARKETS_ROW_PARAMS = ['vs_currency', 'sparkline', 'price_change_percentage', 'locale', 'precision']
const MARKETS_PARAMS = [...MARKETS_ROW_PARAMS, 'ids', 'order', 'page', 'per_page']

type MarketsByIds = { ids: Array<string>; sort: (a: MarketRow, b: MarketRow) => number; rowParams: URLSearchParams }

// coins/markets?ids= requests are served from per coin rows when the response is fully determined by the ids
const parseMarketsByIds = (url: string): MarketsByIds | undefined => {
  const [path, query] = url.split('?')
  if (path !== 'coins/markets' || !query) return

  const params = new URLSearchParams(query)
  if ([...params.keys()].some((key) => !MARKETS_PARAMS.includes(key))) return

  const ids = [
    ...new Set(
      (params.get('ids') ?? '')
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
  if (!ids.length || ids.length > MARKETS_MAX_IDS) return

  const sort = MARKETS_ORDERS[params.get('order') ?? 'market_cap_desc']
  if (!sort) return

  // the response must be a single page containing every requested id
  if (Number(params.get('page') ?? 1) !== 1 || Number(params.get('per_page') ?? 100) < ids.length) return

  const rowParams = new URLSearchParams()
  MARKETS_ROW_PARAMS.forEach((key) => params.has(key) && rowParams.set(key, params.get(key) as string))
  rowParams.sort()

  return { ids, sort, rowParams }
}

type CachedResponse = Pick<AxiosResponse, 'status' | 'headers' | 'data'>
type RequestCache = Map<string, { response: CachedResponse; expires: number }>
type RowCache = Map<string, { row: MarketRow | null; expires: number }>

const sendError = (res: Response, err: unknown) => {
  if (isAxiosError(err)) {
    res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
  } else if (err instanceof Error) {
    res.status(500).send(err.message || 'Internal Server Error')
  } else {
    res.status(500).send('Internal Server Error')
  }
}

export class CoinGecko {
  private axiosInstance: Axios
  private requestCache: RequestCache
  private inflight = new Map<string, Promise<CachedResponse>>()
  private rowCache: RowCache = new Map()
  private rowInflight = new Map<string, Promise<void>>()

  constructor() {
    this.requestCache = new Map()
    this.axiosInstance = axios.create({
      timeout: 10_000,
      headers: {
        'x-cg-pro-api-key': COINGECKO_API_KEY,
      },
    })

    setInterval(() => {
      const now = Date.now()
      this.requestCache.forEach(({ expires }, key) => expires <= now && this.requestCache.delete(key))
      this.rowCache.forEach(({ expires }, key) => expires <= now && this.rowCache.delete(key))
    }, 60_000)
  }

  async handler(req: Request, res: Response): Promise<void> {
    const { url, ttl } = normalize(req.url.substring('/api/v1/markets/'.length))

    const marketsByIds = parseMarketsByIds(url)
    if (marketsByIds) {
      try {
        await this.handleMarketsByIds(res, marketsByIds)
      } catch (err) {
        sendError(res, err)
      }
      return
    }

    const cached = this.requestCache.get(url)
    if (cached && cached.expires > Date.now()) {
      Object.entries(cached.response.headers).forEach(([k, v]) => res.set(k, v))
      res.set('X-Cache', 'HIT').status(cached.response.status).send(cached.response.data)
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

      Object.entries(response.headers).forEach(([k, v]) => res.set(k, v))
      res.status(response.status).send(response.data)
    } catch (err) {
      sendError(res, err)
    }
  }

  private async handleMarketsByIds(res: Response, { ids, sort, rowParams }: MarketsByIds): Promise<void> {
    const key = (id: string) => `${id}?${rowParams}`

    const getRow = (id: string) => {
      const cached = this.rowCache.get(key(id))
      return cached && cached.expires > Date.now() ? cached : undefined
    }

    // ids already being fetched by another request share that request, the rest are fetched together
    const missing = ids.filter((id) => !getRow(id) && !this.rowInflight.has(key(id)))

    if (missing.length) {
      const request = this.fetchMarketRows(missing, rowParams, key)
      missing.forEach((id) => this.rowInflight.set(key(id), request))
      request.finally(() => missing.forEach((id) => this.rowInflight.delete(key(id)))).catch(() => undefined)
    }

    await Promise.all(ids.map((id) => this.rowInflight.get(key(id))))

    const rows = ids.flatMap((id) => getRow(id)?.row ?? [])

    res
      .set('X-Cache', missing.length ? 'MISS' : 'HIT')
      .status(200)
      .json(rows.sort(sort))
  }

  private async fetchMarketRows(
    ids: Array<string>,
    rowParams: URLSearchParams,
    key: (id: string) => string
  ): Promise<void> {
    const params = new URLSearchParams(rowParams)
    params.set('ids', ids.join(','))
    params.set('per_page', String(ids.length))

    const { data } = await this.axiosInstance.get<Array<MarketRow>>(`${BASE_URL}coins/markets?${params}`)

    const rows = new Map(data.map((row) => [row.id, row]))
    const expires = Date.now() + CACHE_TTL_MS

    // unknown ids are omitted by coingecko, cache them as empty so they aren't refetched every request
    ids.forEach((id) => this.rowCache.set(key(id), { row: rows.get(id) ?? null, expires }))
  }

  private async fetch(url: string, ttl: number): Promise<CachedResponse> {
    const cache = ({ status, headers, data }: AxiosResponse): CachedResponse => {
      const response = { status, headers, data }
      this.requestCache.set(url, { response, expires: Date.now() + ttl })
      return response
    }

    try {
      return cache(await this.axiosInstance.get(`${BASE_URL}${url}`))
    } catch (err) {
      // unknown coins/contracts are stable, so cache not found responses to avoid repeat upstream calls
      if (isAxiosError(err) && err.response?.status === 404) return cache(err.response)

      throw err
    }
  }
}
