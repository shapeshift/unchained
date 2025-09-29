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

type RequestCache = Partial<Record<string, AxiosResponse>>

export class Portals {
  private axiosInstance: Axios
  private requestCache: RequestCache
  private limiter: Bottleneck

  constructor() {
    this.requestCache = {}
    this.axiosInstance = axios.create({
      headers: {
        Authorization: `Bearer ${PORTALS_API_KEY}`,
      },
    })
    this.limiter = new Bottleneck({
      reservoir: 3000,
      reservoirRefreshAmount: 3000,
      reservoirRefreshInterval: 60 * 1000,
      maxConcurrent: 50,
      minTime: 100,
    })
  }

  async handler(req: Request, res: Response): Promise<void> {
    const parsedUrl = new URL(req.url, 'https://dummy.com')
    const url = req.url.substring('/api/v1/portals/'.length)

    const path = parsedUrl.pathname.replace('/api/v1/portals', '')
    const ttl = ttlByPath[path]

    if (ttl) {
      const cachedResponse = this.requestCache[req.url]
      if (cachedResponse) {
        Object.entries(cachedResponse.headers).forEach(([k, v]) => res.set(k, v))
        res.set('X-Cache', 'HIT').status(cachedResponse.status).send(cachedResponse.data)
        return
      }

      res.set('X-Cache', 'MISS')
    }

    try {
      const response = await this.limiter.schedule(() => this.axiosInstance.get(`${BASE_URL}${url}`))

      if (ttl) {
        this.requestCache[req.url] = response
        setTimeout(() => delete this.requestCache[req.url], ttl)
      }

      Object.entries(response.headers).forEach(([k, v]) => res.set(k, v))
      res.status(response.status).send(response.data)
    } catch (err) {
      if (isAxiosError(err)) {
        res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
      } else if (err instanceof Error) {
        res.status(500).send(err.message || 'Internal Server Error')
      } else {
        res.status(500).send('Internal Server Error')
      }
    }
  }
}
