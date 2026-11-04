import { Logger } from '@shapeshiftoss/logger'
import axios, { isAxiosError } from 'axios'
import { Request, Response } from 'express'

const KYBER_API_KEY = process.env.KYBER_API_KEY

if (!KYBER_API_KEY) throw new Error('KYBER_API_KEY env var not set')

const BASE_URL = 'https://api.kyberswap.com/swap'

// Matches the `source` web sends on route/build, so routes and builds attribute to the same client
const CLIENT_ID = 'shapeshift'

export class Kyber {
  private axiosInstance = axios.create({
    headers: { 'X-Api-Key': KYBER_API_KEY, 'X-Client-Id': CLIENT_ID },
    timeout: 10_000,
  })

  constructor(private logger: Logger) {}

  // Routes pin the chain slug to [a-z0-9-]+, so the path cannot escape the /swap gateway
  async handler(req: Request, res: Response): Promise<void> {
    const { search } = new URL(req.url, 'https://dummy.com')
    const path = req.path.replace(/^\/api\/v1\/kyber/, '').replace(/\/+$/, '')

    try {
      const response = await this.axiosInstance.request({
        method: req.method,
        url: `${BASE_URL}${path}${search}`,
        data: req.method === 'POST' ? req.body : undefined,
      })

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

    const status = err.response?.status

    // Auth failures mean our server key is bad, which the client cannot fix
    if (status === 401 || status === 403) {
      this.logger.error({ status, data: err.response?.data }, 'Kyber rejected the proxy api key')
      res.status(502).send('Bad Gateway')
      return
    }

    // Preserve upstream backoff guidance and make it readable by browser clients
    const retryAfter = err.response?.headers['retry-after']
    if (typeof retryAfter === 'string') {
      res.set('Retry-After', retryAfter)
      res.append('Access-Control-Expose-Headers', 'Retry-After')
    }

    res.status(status ?? 500).send(err.response?.data || 'Internal Server Error')
  }
}
