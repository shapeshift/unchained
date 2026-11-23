import { Logger } from '@shapeshiftoss/logger'
import axios, { isAxiosError } from 'axios'
import { Request, Response } from 'express'
import { relayError, relayHeaders } from './utils'

const ACROSS_API_KEY = process.env.ACROSS_API_KEY

if (!ACROSS_API_KEY) throw new Error('ACROSS_API_KEY env var not set')

const BASE_URL = 'https://api.across.to/v1'

// The API wraps errors in `error` while its gateway (401/429) returns them flat, so callers always get the flat shape
const flattenError = (err: unknown): unknown => {
  if (!isAxiosError(err) || !Buffer.isBuffer(err.response?.data)) return err

  try {
    const body = JSON.parse(err.response.data.toString())
    if (typeof body?.error === 'object' && body.error !== null) {
      err.response.data = Buffer.from(JSON.stringify(body.error))
    }
  } catch {
    // Non-JSON bodies are relayed untouched
  }

  return err
}

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

  async executionHandler(req: Request, res: Response): Promise<void> {
    await this.relay(res, {
      method: 'POST',
      url: `${BASE_URL}/quotes/${req.params.orderId}/executions`,
      data: req.body,
    })
  }

  async transferHandler(req: Request, res: Response): Promise<void> {
    await this.relay(res, { method: 'GET', url: `${BASE_URL}/transfers/${req.params.orderId}` })
  }

  private async relay(res: Response, config: { method: 'GET' | 'POST'; url: string; data?: unknown }): Promise<void> {
    try {
      const response = await this.axiosInstance.request(config)

      relayHeaders(res, response.headers)

      res.status(response.status).send(response.data)
    } catch (err) {
      relayError(res, flattenError(err), this.logger)
    }
  }
}
