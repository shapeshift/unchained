import { ApiError as BlockbookApiError } from '@shapeshiftoss/blockbook'
import { ApiError } from '.'
import axios, { CreateAxiosDefaults, isAxiosError } from 'axios'
import axiosRetry, { isNetworkOrIdempotentRequestError } from 'axios-retry'
import { promises as dns } from 'dns'
import { isIP } from 'net'

const MAX_PAGE_SIZE = 100

export function validatePageSize(pageSize: number): void {
  if (pageSize <= 0) throw new ApiError('Bad Request', 422, 'page size must be greater than 0')
  if (pageSize > MAX_PAGE_SIZE) throw new ApiError('Bad Request', 422, `Max allowed page size is ${MAX_PAGE_SIZE}`)
}

export const handleError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err

  if (isAxiosError(err)) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return new ApiError('Gateway Timeout', 504, err.message || 'Request timeout')
    }

    return new ApiError(
      err.response?.statusText || 'Internal Server Error',
      err.response?.status ?? 500,
      JSON.stringify(err.response?.data.error) || err.response?.data.message || err.message
    )
  }

  if (err instanceof BlockbookApiError) {
    return new ApiError(err.response?.statusText || 'Internal Server Error', err.response?.status ?? 500, err.message)
  }

  if (err instanceof Error) {
    return new ApiError('Internal Server Error', 500, err.message || 'unknown error')
  }

  return new ApiError('Internal Server Error', 500, 'unknown error')
}

type RetryConfig = {
  retries?: number
  delayFactor?: number
}

export const createAxiosRetry = (config: RetryConfig, axiosParams?: CreateAxiosDefaults) => {
  const axiosWithRetry = axios.create(axiosParams)

  axiosRetry(axiosWithRetry, {
    shouldResetTimeout: true,
    retries: config.retries ?? 3,
    retryDelay: (retryCount, err) => {
      // don't add delay on top of request timeout
      if (err.code === 'ECONNABORTED') return 0
      // add exponential delay for network errors
      return axiosRetry.exponentialDelay(retryCount, undefined, config.delayFactor ?? 500)
    },
    retryCondition: (err) =>
      isNetworkOrIdempotentRequestError(err) ||
      (err.response && err.response.status > 404 && err.response.status < 600) ||
      err.code === 'ECONNABORTED',
  })

  return axiosWithRetry
}

export const exponentialDelay = async (retryCount: number, delayFactor = 500) =>
  new Promise((resolve) => setTimeout(resolve, axiosRetry.exponentialDelay(retryCount, undefined, delayFactor)))

let _rpcId = Math.floor(Math.random() * 1e6)
export const rpcId = (): number => {
  _rpcId = (_rpcId + 1) & 0x7fffffff
  if (_rpcId === 0) _rpcId = 1
  return _rpcId
}

const isPrivateIPv4 = (ip: string): boolean => {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8 "this network"
  if (a === 10) return true // 10.0.0.0/8 private
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false
}

const isPrivateIPv6 = (ip: string): boolean => {
  const v = ip.toLowerCase()
  if (v === '::1' || v === '::') return true // loopback / unspecified
  if (v.startsWith('fe80:')) return true // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true // fc00::/7 unique-local
  const mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/) // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1])
  return false
}

// assertSafeOutboundUrl validates a caller-influenced URL before the server fetches it, to prevent
// SSRF: it allows only http(s), resolves the host, and rejects any private/loopback/link-local/CGNAT
// or cloud-metadata destination. Pair with `maxRedirects: 0` on the request so a public host can't
// 3xx-bounce to an internal one after this check.
export const assertSafeOutboundUrl = async (rawUrl: string): Promise<void> => {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ApiError('Bad Request', 400, `invalid outbound url: ${rawUrl}`)
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ApiError('Bad Request', 400, `unsupported outbound url scheme: ${url.protocol}`)
  }

  const host = url.hostname.replace(/^\[|\]$/g, '') // strip brackets from IPv6 literals

  const addresses = isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address)

  for (const address of addresses) {
    const blocked = isIP(address) === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address)
    if (blocked) throw new ApiError('Bad Request', 400, `blocked outbound url host: ${host}`)
  }
}
