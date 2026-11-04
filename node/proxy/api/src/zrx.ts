import { Logger } from '@shapeshiftoss/logger'
import axios from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'
import { relayError, relayHeaders } from './utils'

const ZRX_API_KEY = process.env.ZRX_API_KEY

if (!ZRX_API_KEY) throw new Error('ZRX_API_KEY env var not set')

const BASE_URL = 'https://api.0x.org'

const ALLOWED_PATHS = new Set(['/swap/permit2/price', '/swap/permit2/quote', '/trade-analytics/swap'])

export class Zrx {
  private logger: Logger
  private axiosInstance: Axios

  constructor(logger: Logger) {
    this.logger = logger.child({ namespace: ['zrx'] })
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
      res.locals.unrouted = true
      res.status(404).send('Not Found')
      return
    }

    try {
      const response = await this.axiosInstance.get(`${BASE_URL}${path}${parsedUrl.search}`)
      relayHeaders(res, response.headers)
      res.status(response.status).send(response.data)
    } catch (err) {
      relayError(res, err, this.logger)
    }
  }
}
