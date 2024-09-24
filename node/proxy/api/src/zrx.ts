import axios, { isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'

const ZRX_API_KEY = process.env.ZRX_API_KEY

if (!ZRX_API_KEY) throw new Error('ZRX_API_KEY env var not set')

export class Zrx {
  private axiosInstance: Axios

  constructor() {
    this.axiosInstance = axios.create({
      headers: {
        '0x-api-key': ZRX_API_KEY,
      },
    })
  }

  async handler(req: Request, res: Response): Promise<void> {
    const parsedUrl = new URL('https://dummy.com'.concat(req.url))
    const path = parsedUrl.pathname.substring('/api/v1/zrx/'.length)

    const url = (() => {
      if (path.includes('v1')) {
        const [chain, ...parts] = path.split('/')
        const url = parts.join('/').concat(parsedUrl.search)

        const baseUrl = (() => {
          switch (chain) {
            case 'arbitrum':
              return 'https://arbitrum.api.0x.org/'
            case 'avalanche':
              return 'https://avalanche.api.0x.org/'
            case 'base':
              return 'https://base.api.0x.org/'
            case 'bnbsmartchain':
              return 'https://bsc.api.0x.org/'
            case 'ethereum':
              return 'https://api.0x.org/'
            case 'optimism':
              return 'https://optimism.api.0x.org/'
            case 'polygon':
              return 'https://polygon.api.0x.org/'
            default:
              return
          }
        })()

        if (!baseUrl) return

        return baseUrl.concat(url)
      } else {
        const baseUrl = 'https://api.0x.org/'
        const url = path.concat(parsedUrl.search)

        return baseUrl.concat(url)
      }
    })()

    if (!url) {
      res.status(404).send('Not Found')
      return
    }

    try {
      const response = await this.axiosInstance.get(url)
      Object.entries(response.headers).forEach(([k, v]) => res.set(k, v))
      res.status(response.status).send(response.data)
    } catch (err) {
      if (isAxiosError(err)) {
        res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
      } else if (err instanceof Error) {
        res.status(500).send(err.message || 'Internal Server Error')
      } else {
        res.status(500).send('Internal Server Error')
      }
    }
  }
}
