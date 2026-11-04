import { Logger } from '@shapeshiftoss/logger'
import axios from 'axios'
import { Request, Response } from 'express'
import { relayError, relayHeaders } from './utils'

const KYBER_API_KEY = process.env.KYBER_API_KEY

if (!KYBER_API_KEY) throw new Error('KYBER_API_KEY env var not set')

const BASE_URL = 'https://api.kyberswap.com/swap'

// Matches the `source` web sends on route/build, so routes and builds attribute to the same client
const CLIENT_ID = 'shapeshift'

export class Kyber {
  private logger: Logger
  private axiosInstance = axios.create({
    headers: { 'X-Api-Key': KYBER_API_KEY, 'X-Client-Id': CLIENT_ID },
    timeout: 10_000,
  })

  constructor(logger: Logger) {
    this.logger = logger.child({ namespace: ['kyber'] })
  }

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
      relayError(res, err, this.logger)
    }
  }
}
