import { Logger } from '@shapeshiftoss/logger'
import axios from 'axios'
import { Axios } from 'axios'
import Bottleneck from 'bottleneck'
import { Request, Response } from 'express'
import { MB, ResponseCache } from './cache'
import { Route, params, toUpstreamRequest } from './upstream'
import { relayError, relayHeaders } from './utils'

const PORTALS_API_KEY = process.env.PORTALS_API_KEY

if (!PORTALS_API_KEY) throw new Error('PORTALS_API_KEY env var not set')

const BASE_URL = 'https://api.portals.fi/'
const PREFIX = '/api/v1/portals'

// jobs waiting on the upstream limiter beyond this are rejected instead of queued
const MAX_QUEUED = 500

// cached endpoints only forward documented params, so unused ones can't vary the cache key;
// uncached endpoints hit portals on every call regardless, so their params pass through untouched
export const ROUTES: ReadonlyArray<Route & { ttl?: number }> = [
  { path: /^v2\/platforms$/, params: params(), ttl: 60_000 * 30 },
  { path: /^v2\/networks$/, params: params(), ttl: 60_000 * 60 },
  {
    path: /^v2\/tokens$/,
    params: params(
      ...['ids', 'networks', 'platforms', 'tags'].flatMap((name) => [name, `${name}[]`]),
      'search',
      'minLiquidity',
      'maxLiquidity',
      'minApy',
      'maxApy',
      'sortBy',
      'sortDirection',
      'limit',
      'page'
    ),
    ttl: 60_000 * 5,
  },
  { path: /^v2\/tokens\/history$/, params: params('id', 'from', 'to', 'resolution', 'page'), ttl: 60_000 * 5 },
  { path: /^v2\/account$/, params: 'all' },
  { path: /^v2\/portal$/, params: 'all' },
  { path: /^v2\/portal\/estimate$/, params: 'all' },
]

export class Portals {
  private logger: Logger
  private axiosInstance: Axios
  private requestCache: ResponseCache
  private limiter: Bottleneck

  constructor(logger: Logger) {
    this.logger = logger.child({ namespace: ['portals'] })
    this.requestCache = new ResponseCache({ maxBytes: 64 * MB, maxEntryBytes: 8 * MB })

    this.axiosInstance = axios.create({
      timeout: 15_000,
      maxContentLength: 16 * MB,
      // keep raw bodies so cached responses are served without re-serializing
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Bearer ${PORTALS_API_KEY}`,
      },
    })
    this.limiter = new Bottleneck({
      reservoir: 3000,
      reservoirRefreshAmount: 3000,
      reservoirRefreshInterval: 60 * 1000,
      maxConcurrent: 50,
      highWater: MAX_QUEUED,
      strategy: Bottleneck.strategy.OVERFLOW,
    })
  }

  async handler(req: Request, res: Response): Promise<void> {
    const request = toUpstreamRequest(req.url, PREFIX, ROUTES)

    if (!request) {
      res.locals.unrouted = true
      res.status(404).send('Not Found')
      return
    }

    const { url } = request
    const { ttl } = request.route

    if (ttl) {
      const cached = this.requestCache.get(url)
      if (cached) {
        relayHeaders(res, cached.headers)
        res.set('X-Cache', 'HIT').status(cached.status).send(cached.data)
        return
      }

      res.set('X-Cache', 'MISS')
    }

    // bottleneck admits jobs one at a time, so a burst piles up as received jobs before highWater sees it
    const { RECEIVED, QUEUED } = this.limiter.counts()
    if (RECEIVED + QUEUED >= MAX_QUEUED) return this.reject(res)

    try {
      const { status, headers, data } = await this.limiter.schedule(() =>
        this.axiosInstance.get<Buffer>(`${BASE_URL}${url}`)
      )

      if (ttl) this.requestCache.set(url, { status, headers, data }, ttl)

      relayHeaders(res, headers)
      res.status(status).send(data)
    } catch (err) {
      if (err instanceof Bottleneck.BottleneckError) return this.reject(res)
      relayError(res, err, this.logger)
    }
  }

  private reject(res: Response): void {
    this.logger.warn({ path: res.req.path }, 'portals limiter queue full, request rejected')
    res.set('Retry-After', '5')
    res.append('Access-Control-Expose-Headers', 'Retry-After')
    res.status(503).send('Service Unavailable')
  }
}
