import { Logger } from '@shapeshiftoss/logger'
import { Request, Response } from 'express'

export const logger = new Logger({ namespace: ['test'], level: 'none' })

export type FakeResponse = {
  statusCode: number
  headers: Record<string, string>
  body: unknown
  locals: Record<string, unknown>
}

export const fakeExchange = (url: string): { req: Request; res: Response; out: FakeResponse } => {
  const out: FakeResponse = { statusCode: 200, headers: {}, body: undefined, locals: {} }
  const req = { url, path: url.split('?')[0], headers: {}, socket: {} } as unknown as Request

  const res = {
    req,
    locals: out.locals,
    set(key: string, value: string) {
      out.headers[key.toLowerCase()] = String(value)
      return res
    },
    append(key: string, value: string) {
      const current = out.headers[key.toLowerCase()]
      out.headers[key.toLowerCase()] = current ? `${current}, ${value}` : value
      return res
    },
    type(value: string) {
      out.headers['content-type'] = value
      return res
    },
    status(code: number) {
      out.statusCode = code
      return res
    },
    send(body: unknown) {
      out.body = body
      return res
    },
    json(body: unknown) {
      out.body = body
      return res
    },
  } as unknown as Response

  return { req, res, out }
}

export type Upstream = { calls: Array<string>; get: (url: string) => Promise<unknown> }

export const fakeUpstream = (
  respond: (url: string) => unknown = () => ({ status: 200, headers: {}, data: Buffer.from('{}') })
): Upstream => {
  const calls: Array<string> = []
  return {
    calls,
    get: async (url: string) => {
      calls.push(url)
      return respond(url)
    },
  }
}

// swaps the private axios instance of a proxy for a fake one
export const withUpstream = (proxy: object, upstream: Upstream): void => {
  ;(proxy as unknown as { axiosInstance: Upstream }).axiosInstance = upstream
}
