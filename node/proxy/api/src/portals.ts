import axios, { AxiosResponse, isAxiosError } from 'axios'
import { Axios } from 'axios'
import Bottleneck from 'bottleneck'
import { Request, Response } from 'express'

const PORTALS_API_KEY = process.env.PORTALS_API_KEY

if (!PORTALS_API_KEY) throw new Error('PORTALS_API_KEY env var not set')

const ttlByPath: Partial<Record<string, number>> = {
  '/v2/platforms': 60_000 * 30,
  '/v2/networks': 60_000 * 60,
  '/v2/tokens': 60_000 * 5,
  '/v2/tokens/history': 60_000 * 5,
}

const BASE_URL = 'https://api.portals.fi/'

type CachedResponse = Pick<AxiosResponse<Buffer>, 'status' | 'headers' | 'data'>
type RequestCache = Map<string, { response: CachedResponse; expires: number }>

export class Portals {
  private axiosInstance: Axios
  private requestCache: RequestCache
  private limiter: Bottleneck

  constructor() {
    this.requestCache = new Map()
    this.axiosInstance = axios.create({
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
    })

    setInterval(() => {
      const now = Date.now()
      this.requestCache.forEach(({ expires }, key) => expires <= now && this.requestCache.delete(key))
    }, 60_000)
  }

  async handler(req: Request, res: Response): Promise<void> {
    const parsedUrl = new URL(req.url, 'https://dummy.com')
    const url = req.url.substring('/api/v1/portals/'.length)

    const path = parsedUrl.pathname.replace('/api/v1/portals', '')
    const ttl = ttlByPath[path]

    if (ttl) {
      const cached = this.requestCache.get(req.url)
      if (cached && cached.expires > Date.now()) {
        Object.entries(cached.response.headers).forEach(([k, v]) => res.set(k, v))
        res.set('X-Cache', 'HIT').status(cached.response.status).send(cached.response.data)
        return
      }

      res.set('X-Cache', 'MISS')
    }

    try {
      const { status, headers, data } = await this.limiter.schedule(() =>
        this.axiosInstance.get<Buffer>(`${BASE_URL}${url}`)
      )

      if (ttl) {
        this.requestCache.set(req.url, { response: { status, headers, data }, expires: Date.now() + ttl })
      }

      Object.entries(headers).forEach(([k, v]) => res.set(k, v))
      res.status(status).send(data)
    } catch (err) {
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
  }
}
