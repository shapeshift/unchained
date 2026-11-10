import { Logger } from '@shapeshiftoss/logger'
import axios from 'axios'
import { Request, Response } from 'express'
import { relayError, relayHeaders } from './utils'

const SYMBIOSIS_API_KEY = process.env.SYMBIOSIS_API_KEY

if (!SYMBIOSIS_API_KEY) throw new Error('SYMBIOSIS_API_KEY env var not set')

const BASE_URL = 'https://api.symbiosis.finance/crosschain'

export class Symbiosis {
  private logger: Logger

  private axiosInstance = axios.create({
    headers: { 'X-Api-Key': SYMBIOSIS_API_KEY },
    responseType: 'arraybuffer',
    timeout: 10_000,
  })

  constructor(logger: Logger) {
    this.logger = logger.child({ namespace: ['symbiosis'] })
  }

  async quoteHandler(req: Request, res: Response): Promise<void> {
    await this.relay(res, { method: 'POST', url: `${BASE_URL}/v2/quote`, data: req.body })
  }

  async txHandler(req: Request, res: Response): Promise<void> {
    const { chainId, txHash } = req.params
    await this.relay(res, { method: 'GET', url: `${BASE_URL}/v2/tx/${chainId}/${txHash}` })
  }

  private async relay(res: Response, config: { method: 'GET' | 'POST'; url: string; data?: unknown }): Promise<void> {
    try {
      const response = await this.axiosInstance.request(config)

      relayHeaders(res, response.headers)

      res.status(response.status).send(response.data)
    } catch (err) {
      relayError(res, err, this.logger)
    }
  }
}
