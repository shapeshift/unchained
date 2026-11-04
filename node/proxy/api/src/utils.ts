import { Logger } from '@shapeshiftoss/logger'
import { isAxiosError } from 'axios'
import { Response } from 'express'

// Framing and connection headers are set by express, while CORS, cookies and cache status belong to the proxy
const UNRELAYED_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'set-cookie',
  'x-cache',
])

const isRelayedHeader = (key: string): boolean => {
  const header = key.toLowerCase()
  return !UNRELAYED_HEADERS.has(header) && !header.startsWith('access-control-')
}

export const relayHeaders = (res: Response, headers: object): void => {
  Object.entries(headers).forEach(([k, v]) => isRelayedHeader(k) && res.set(k, v))
}

// Relays upstream failures as-is; anything else is ours, so it is logged and kept out of the response
export const relayError = (res: Response, err: unknown, logger: Logger): void => {
  const path = res.req.path

  if (!isAxiosError(err)) {
    const error = err instanceof Error ? { message: err.message, stack: err.stack } : String(err)
    logger.error({ error, path }, 'proxy request failed')
    res.status(500).send('Internal Server Error')
    return
  }

  // No response means the upstream timed out or dropped the connection
  if (!err.response) {
    const timedOut = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT'
    logger.error({ code: err.code, path }, 'upstream request failed without a response')
    res.status(timedOut ? 504 : 502).send(timedOut ? 'Gateway Timeout' : 'Bad Gateway')
    return
  }

  const { status, headers, data } = err.response

  // Callers never send upstream credentials, so auth failures usually mean our key or plan is bad
  if (status === 401 || status === 403) {
    logger.error(
      { statusCode: status, data: Buffer.isBuffer(data) ? data.toString() : data, path },
      'upstream rejected the proxy request'
    )
  }

  // Raw buffer bodies need the upstream type restored, otherwise express sends them as octet-stream
  const contentType = headers['content-type']
  if (typeof contentType === 'string') res.type(contentType)

  // Preserve upstream backoff guidance and make it readable by browser clients
  const retryAfter = headers['retry-after']
  if (typeof retryAfter === 'string') {
    res.set('Retry-After', retryAfter)
    res.append('Access-Control-Expose-Headers', 'Retry-After')
  }

  res.status(status).send(data || 'Internal Server Error')
}
