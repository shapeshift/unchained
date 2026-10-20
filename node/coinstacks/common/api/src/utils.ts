import { isMoralisError } from '@moralisweb3/common-core'
import { ApiError as BlockbookApiError } from '@shapeshiftoss/blockbook'
import { ApiError } from '.'
import type { Logger } from '@shapeshiftoss/logger'
import axios, { AxiosInstance, CreateAxiosDefaults, InternalAxiosRequestConfig, isAxiosError } from 'axios'
import axiosRetry, { isNetworkOrIdempotentRequestError } from 'axios-retry'
import { STATUS_CODES } from 'http'
import { BaseError as ViemError } from 'viem'

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

  // moralis sdk request errors carry the upstream status, pass client errors through instead of masking them as 500
  if (isMoralisError(err)) {
    const status = err.details?.status
    if (status === 400 || status === 404) {
      return new ApiError(STATUS_CODES[status] ?? 'Bad Request', status, err.message)
    }
  }

  if (err instanceof ViemError) {
    const message = err.details ? `${err.shortMessage} ${err.details}` : err.shortMessage
    return new ApiError('Internal Server Error', 500, message || 'unknown error')
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

const SLOW_REQUEST_THRESHOLD_MS = 1000

// custom config keys are copied onto every retry attempt, so timing spans all attempts and is logged once
type TimedRequestConfig = InternalAxiosRequestConfig & {
  slowRequestStart?: number
  slowRequestLogged?: boolean
  'axios-retry'?: { retryCount?: number }
}

const loggedInstances = new WeakSet<AxiosInstance>()

// log upstream requests slower than the threshold to attribute api latency to its source
// the query is dropped and long path segments are masked since some upstreams take api keys in the url
export const logSlowRequests = (instance: AxiosInstance, logger: Logger): void => {
  if (loggedInstances.has(instance)) return
  loggedInstances.add(instance)

  const log = (config: TimedRequestConfig | undefined, status: number | string | undefined) => {
    if (!config?.slowRequestStart || config.slowRequestLogged) return
    config.slowRequestLogged = true

    const duration = Date.now() - config.slowRequestStart
    if (duration < SLOW_REQUEST_THRESHOLD_MS) return

    const url = (() => {
      try {
        return new URL(instance.getUri(config), 'http://unknown')
      } catch {
        return undefined
      }
    })()

    logger.warn(
      {
        method: config.method,
        host: url?.host,
        path: url?.pathname.replace(/[^/]{20,}/g, ':id'),
        statusCode: status,
        duration,
        retries: config['axios-retry']?.retryCount ?? 0,
      },
      'slow upstream request'
    )
  }

  instance.interceptors.request.use((config: TimedRequestConfig) => {
    config.slowRequestStart ??= Date.now()
    return config
  })

  instance.interceptors.response.use(
    (response) => {
      log(response.config, response.status)
      return response
    },
    (err) => {
      if (isAxiosError(err)) log(err.config, err.response?.status ?? err.code)
      return Promise.reject(err)
    }
  )
}

let _rpcId = Math.floor(Math.random() * 1e6)
export const rpcId = (): number => {
  _rpcId = (_rpcId + 1) & 0x7fffffff
  if (_rpcId === 0) _rpcId = 1
  return _rpcId
}
