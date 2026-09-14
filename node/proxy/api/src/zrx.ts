import axios, { isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'

const ZRX_API_KEY = process.env.ZRX_API_KEY

if (!ZRX_API_KEY) throw new Error('ZRX_API_KEY env var not set')

const BASE_URL = 'https://api.0x.org'

const ALLOWED_PATHS = new Set(['/swap/permit2/price', '/swap/permit2/quote', '/trade-analytics/swap'])

export class Zrx {
  private axiosInstance: Axios

  constructor() {
    this.axiosInstance = axios.create({
      headers: {
        '0x-api-key': ZRX_API_KEY,
        '0x-version': 'v2',
      },
    })
  }

  async handler(req: Request, res: Response): Promise<void> {
    const parsedUrl = new URL(req.url, 'https://dummy.com')
    const path = parsedUrl.pathname.replace(/^\/api\/v1\/zrx/, '').replace(/\/+$/, '')

    if (!ALLOWED_PATHS.has(path)) {
      res.status(404).send('Not Found')
      return
    }

    try {
      const response = await this.axiosInstance.get(`${BASE_URL}${path}${parsedUrl.search}`)
      Object.entries(response.headers).forEach(([k, v]) => res.set(k, v))
      res.status(response.status).send(response.data)
    } catch (err) {
      if (isAxiosError(err)) {
        // Preserve upstream backoff guidance and make it readable by browser clients.
        const retryAfter = err.response?.headers['retry-after']
        if (typeof retryAfter === 'string') {
          res.set('Retry-After', retryAfter)
          res.append('Access-Control-Expose-Headers', 'Retry-After')
        }

        res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
      } else if (err instanceof Error) {
        res.status(500).send(err.message || 'Internal Server Error')
      } else {
        res.status(500).send('Internal Server Error')
      }
    }
  }
}
