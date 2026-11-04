import { Logger } from '@shapeshiftoss/logger'
import { isAxiosError } from 'axios'
import { Response } from 'express'

// Describe the upstream connection and body framing, which express sets itself for the relayed response
const UNRELAYED_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length'])

export const relayHeaders = (res: Response, headers: object): void => {
  Object.entries(headers).forEach(([k, v]) => !UNRELAYED_HEADERS.has(k.toLowerCase()) && res.set(k, v))
}

// Relays upstream failures as-is; anything else is ours, so it is logged and kept out of the response
export const relayError = (res: Response, err: unknown, logger: Logger): void => {
  if (!isAxiosError(err)) {
    logger.error({ err }, 'proxy request failed')
    res.status(500).send('Internal Server Error')
    return
  }

  // Raw buffer bodies need the upstream type restored, otherwise express sends them as octet-stream
  const contentType = err.response?.headers['content-type']
  if (typeof contentType === 'string') res.type(contentType)

  // Preserve upstream backoff guidance and make it readable by browser clients
  const retryAfter = err.response?.headers['retry-after']
  if (typeof retryAfter === 'string') {
    res.set('Retry-After', retryAfter)
    res.append('Access-Control-Expose-Headers', 'Retry-After')
  }

  res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
}
