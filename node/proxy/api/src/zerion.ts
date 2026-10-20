import axios, { AxiosResponse, isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'

const ZERION_API_KEY = process.env.ZERION_API_KEY

if (!ZERION_API_KEY) throw new Error('ZERION_API_KEY env var not set')

const CACHE_TTL_MS = 60_000
const BASE_URL = 'https://api.zerion.io/v1/'

type CachedResponse = Pick<AxiosResponse<Buffer>, 'status' | 'headers' | 'data'>
type RequestCache = Map<string, { response: CachedResponse; expires: number }>

export class Zerion {
  private axiosInstance: Axios
  private requestCache: RequestCache

  constructor() {
    this.requestCache = new Map()
    this.axiosInstance = axios.create({
      // keep raw bodies so cached responses are served without re-serializing
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Basic ${ZERION_API_KEY}`,
      },
    })

    setInterval(() => {
      const now = Date.now()
      this.requestCache.forEach(({ expires }, key) => expires <= now && this.requestCache.delete(key))
    }, 60_000)
  }

  async handler(req: Request, res: Response): Promise<void> {
    const url = req.url.substring('/api/v1/zerion/'.length)

    const cached = this.requestCache.get(req.url)
    if (cached && cached.expires > Date.now()) {
      Object.entries(cached.response.headers).forEach(([k, v]) => res.set(k, v))
      res.set('X-Cache', 'HIT').status(cached.response.status).send(cached.response.data)
      return
    }

    res.set('X-Cache', 'MISS')

    try {
      const { status, headers, data } = await this.axiosInstance.get<Buffer>(`${BASE_URL}${url}`)
      this.requestCache.set(req.url, { response: { status, headers, data }, expires: Date.now() + CACHE_TTL_MS })
      Object.entries(headers).forEach(([k, v]) => res.set(k, v))
      res.status(status).send(data)
    } catch (err) {
      if (isAxiosError(err)) {
        const contentType = err.response?.headers['content-type']
        if (contentType) res.type(contentType)
        res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
      } else if (err instanceof Error) {
        res.status(500).send(err.message || 'Internal Server Error')
      } else {
        res.status(500).send('Internal Server Error')
      }
    }
  }
}
