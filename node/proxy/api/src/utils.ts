import { Response } from 'express'

// Describe the upstream connection and body framing, which express sets itself for the relayed response
const UNRELAYED_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length'])

export const relayHeaders = (res: Response, headers: object): void => {
  Object.entries(headers).forEach(([k, v]) => !UNRELAYED_HEADERS.has(k.toLowerCase()) && res.set(k, v))
}
