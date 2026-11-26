import { NextFunction, Request, RequestHandler, Response } from 'express'

export type RateLimitOptions = {
  // requests allowed per client within one window
  limit: number
  windowMs: number
  // cap on tracked clients per window, so a flood of distinct addresses can't grow memory without bound
  maxClients?: number
  now?: () => number
}

const firstHeader = (value: string | Array<string> | undefined): string | undefined => {
  const header = Array.isArray(value) ? value[0] : value
  return header?.split(',')[0]?.trim() || undefined
}

// same precedence as the request logger: cloudflare, then the railway edge, then the socket
export const clientIp = (req: Request): string =>
  firstHeader(req.headers['cf-connecting-ip']) ??
  firstHeader(req.headers['x-real-ip']) ??
  req.socket.remoteAddress ??
  'unknown'

/**
 * Fixed window per-client request limiter. Counts reset every window.
 */
export const rateLimit = ({
  limit,
  windowMs,
  maxClients = 100_000,
  now = Date.now,
}: RateLimitOptions): RequestHandler => {
  let windowStart = now()
  let counts = new Map<string, number>()

  return (req: Request, res: Response, next: NextFunction) => {
    const time = now()
    if (time - windowStart >= windowMs) {
      windowStart = time - ((time - windowStart) % windowMs)
      counts = new Map()
    }

    // once the table is full, untracked clients share a single bucket instead of growing it
    const ip = clientIp(req)
    const key = counts.has(ip) || counts.size < maxClients ? ip : '*'
    const total = (counts.get(key) ?? 0) + 1
    counts.set(key, total)

    if (total > limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - time) / 1000))
      res.set('Retry-After', String(retryAfter))
      res.append('Access-Control-Expose-Headers', 'Retry-After')
      res.status(429).send('Too Many Requests')
      return
    }

    next()
  }
}
