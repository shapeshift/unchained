import { Logger } from '@shapeshiftoss/logger'
import axios from 'axios'
import { Request, Response } from 'express'
import { relayError, relayHeaders } from './utils'

const ACROSS_API_KEY = process.env.ACROSS_API_KEY

if (!ACROSS_API_KEY) throw new Error('ACROSS_API_KEY env var not set')

const BASE_URL = 'https://api.across.to/v1'

export class Across {
  private logger: Logger

  private axiosInstance = axios.create({
    headers: { Authorization: `Bearer ${ACROSS_API_KEY}` },
    responseType: 'arraybuffer',
    timeout: 10_000,
  })

  constructor(logger: Logger) {
    this.logger = logger.child({ namespace: ['across'] })
  }

  async quoteHandler(req: Request, res: Response): Promise<void> {
    await this.relay(res, { method: 'POST', url: `${BASE_URL}/quotes`, data: req.body })
  }

  async transferHandler(req: Request, res: Response): Promise<void> {
    await this.relay(res, { method: 'GET', url: `${BASE_URL}/transfers/${req.params.orderId}` })
  }

  async transfersHandler(req: Request, res: Response): Promise<void> {
    const { txnRef } = req.query

    if (typeof txnRef !== 'string' || !/^(0x[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{86,88})$/.test(txnRef)) {
      res.status(400).send('Bad Request')
      return
    }

    await this.relay(res, { method: 'GET', url: `${BASE_URL}/transfers`, params: { txnRef } })
  }

  private async relay(
    res: Response,
    config: { method: 'GET' | 'POST'; url: string; data?: unknown; params?: Record<string, string> }
  ): Promise<void> {
    try {
      const response = await this.axiosInstance.request(config)

      relayHeaders(res, response.headers)

      res.status(response.status).send(response.data)
    } catch (err) {
      relayError(res, err, this.logger)
    }
  }
}
