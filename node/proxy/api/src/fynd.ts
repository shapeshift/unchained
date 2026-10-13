import axios, { isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'

const FYND_API_KEY = process.env.FYND_API_KEY

if (!FYND_API_KEY) throw new Error('FYND_API_KEY env var not set')

const BASE_URL = 'https://fynd-api.propellerheads.xyz/v1'

// Hosted Fynd chain slugs: https://docs.fynd.xyz/get-started/hosted-api
const CHAINS = new Set(['ethereum', 'base', 'arbitrum', 'bsc', 'polygon', 'unichain', 'robinhood'])

// Fynd License 1.0 §3.4 requires this notice wherever Fynd quotes are supplied to others.
const LICENSE_NOTICE =
  'Fynd quotes are licensed under the Fynd License 1.0 (https://github.com/propeller-heads/fynd/blob/main/LICENSE.md). ' +
  'Trades must settle through the Fynd router listed in the Router Registry ' +
  "(https://docs.propellerheads.xyz/tycho/for-solvers/execution/contract-addresses), and the router's fees may not be bypassed."

export class Fynd {
  private axiosInstance: Axios

  constructor() {
    this.axiosInstance = axios.create({
      headers: { Authorization: FYND_API_KEY },
      timeout: 10_000,
    })
  }

  async handler(req: Request, res: Response): Promise<void> {
    const parsedUrl = new URL(req.url, 'https://dummy.com')
    const [, chain, endpoint, ...rest] = parsedUrl.pathname.replace(/^\/api\/v1\/fynd/, '').split('/')

    if (!CHAINS.has(chain) || endpoint !== 'quote' || rest.length) {
      res.status(404).send('Not Found')
      return
    }

    try {
      const response = await this.axiosInstance.post(`${BASE_URL}/${chain}/quote`, req.body)
      Object.entries(response.headers).forEach(([k, v]) => res.set(k, v))
      res.set('Fynd-License-Notice', LICENSE_NOTICE)
      res.append('Access-Control-Expose-Headers', 'Fynd-License-Notice')
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
