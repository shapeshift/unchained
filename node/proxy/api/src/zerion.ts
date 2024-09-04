import axios, { AxiosResponse, isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'

const ZERION_API_KEY = process.env.ZERION_API_KEY

if (!ZERION_API_KEY) throw new Error('ZERION_API_KEY env var not set')

const CACHE_TTL_MS = 60_000
const BASE_URL = 'https://api.zerion.io/v1/'

type RequestCache = Partial<Record<string, AxiosResponse>>

export class Zerion {
  private axiosInstance: Axios
  private requestCache: RequestCache

  constructor() {
    this.requestCache = {}
    this.axiosInstance = axios.create({
      headers: {
        Authorization: `Basic ${ZERION_API_KEY}`,
      },
    })
  }

  async handler(req: Request, res: Response): Promise<void> {
    const url = req.url.substring('/api/v1/zerion/'.length)

    const cachedResponse = this.requestCache[req.url]
    if (cachedResponse) {
      Object.entries(cachedResponse.headers).forEach(([k, v]) => res.set(k, v))
      res.set('X-Cache', 'HIT').status(cachedResponse.status).send(cachedResponse.data)
      return
    }

    res.set('X-Cache', 'MISS')

    try {
      const response = await this.axiosInstance.get(`${BASE_URL}${url}`)
      this.requestCache[req.url] = response
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
    } finally {
      setInterval(() => delete this.requestCache[req.url], CACHE_TTL_MS)
    }
  }
}
