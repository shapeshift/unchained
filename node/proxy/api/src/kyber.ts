import { Logger } from '@shapeshiftoss/logger'
import axios, { isAxiosError } from 'axios'
import { Request, Response } from 'express'
import { relayError, relayHeaders } from './utils'

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
    const isPost = req.method === 'POST'

    try {
      // Express routes HEAD to GET handlers, so anything but POST is forwarded as GET like the other proxies
      const response = await this.axiosInstance.request({
        method: isPost ? 'POST' : 'GET',
        url: `${BASE_URL}${path}${search}`,
        data: isPost ? req.body : undefined,
      })

      relayHeaders(res, response.headers)
      res.status(response.status).send(response.data)
    } catch (err) {
      this.relayError(res, err)
    }
  }

  private relayError(res: Response, err: unknown): void {
    // Auth failures mean our server key is bad, which the client cannot fix
    if (isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
      this.logger.error({ status: err.response.status, data: err.response.data }, 'Kyber rejected the proxy api key')
      res.status(502).send('Bad Gateway')
      return
    }

    relayError(res, err, this.logger)
  }
}
