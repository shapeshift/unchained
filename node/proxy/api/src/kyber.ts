import { Logger } from '@shapeshiftoss/logger'
import axios, { isAxiosError } from 'axios'
import { Request, Response } from 'express'

const KYBER_API_KEY = process.env.KYBER_API_KEY

if (!KYBER_API_KEY) throw new Error('KYBER_API_KEY env var not set')

const BASE_URL = 'https://api.kyberswap.com/swap'

// Aggregator endpoints are scoped by chain slug, e.g. /monad/api/v1/routes
const ROUTES_PATH = /^\/[a-z0-9-]+\/api\/v1\/routes$/
const BUILD_PATH = /^\/[a-z0-9-]+\/api\/v1\/route\/build$/

export class Kyber {
  private axiosInstance = axios.create({ headers: { 'X-Api-Key': KYBER_API_KEY }, timeout: 10_000 })

  constructor(private logger: Logger) {}

  async handler(req: Request, res: Response): Promise<void> {
    const parsedUrl = new URL(req.url, 'https://dummy.com')
    const path = parsedUrl.pathname.replace(/^\/api\/v1\/kyber/, '').replace(/\/+$/, '')

    const isRoutes = req.method === 'GET' && ROUTES_PATH.test(path)
    const isBuild = req.method === 'POST' && BUILD_PATH.test(path)

    if (!isRoutes && !isBuild) {
      res.locals.unrouted = true
      res.status(404).send('Not Found')
      return
    }

    try {
      const url = `${BASE_URL}${path}${parsedUrl.search}`
      const response = isBuild ? await this.axiosInstance.post(url, req.body) : await this.axiosInstance.get(url)

      Object.entries(response.headers).forEach(([k, v]) => res.set(k, v))
      res.status(response.status).send(response.data)
    } catch (err) {
      this.relayError(res, err)
    }
  }

  private relayError(res: Response, err: unknown): void {
    if (!isAxiosError(err)) {
      this.logger.error({ err }, 'Kyber proxy request failed')
      res.status(500).send('Internal Server Error')
      return
    }

    // Preserve upstream backoff guidance and make it readable by browser clients
    const retryAfter = err.response?.headers['retry-after']
    if (typeof retryAfter === 'string') {
      res.set('Retry-After', retryAfter)
      res.append('Access-Control-Expose-Headers', 'Retry-After')
    }

    res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
  }
}
