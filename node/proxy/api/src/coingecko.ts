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

type CachedResponse = Pick<AxiosResponse<Buffer>, 'status' | 'headers' | 'data'>
type RequestCache = Map<string, { response: CachedResponse; expires: number }>

const sendError = (res: Response, err: unknown) => {
  if (isAxiosError(err)) {
    const contentType = err.response?.headers['content-type']
    if (contentType) res.type(contentType)
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

  constructor() {
    this.requestCache = new Map()
    this.axiosInstance = axios.create({
      timeout: 10_000,
      // keep raw bodies so cached responses are served without re-serializing
      responseType: 'arraybuffer',
      headers: {
        'x-cg-pro-api-key': COINGECKO_API_KEY,
      },
    })

    setInterval(() => {
      const now = Date.now()
      this.requestCache.forEach(({ expires }, key) => expires <= now && this.requestCache.delete(key))
    }, 60_000)
  }

  async handler(req: Request, res: Response): Promise<void> {
    const { url, ttl } = normalize(req.url.substring('/api/v1/markets/'.length))

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

  private async fetch(url: string, ttl: number): Promise<CachedResponse> {
    const cache = ({ status, headers, data }: AxiosResponse<Buffer>): CachedResponse => {
      const response = { status, headers, data }
      this.requestCache.set(url, { response, expires: Date.now() + ttl })
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
