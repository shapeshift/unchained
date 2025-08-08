import { ApiError as BlockbookApiError } from '@shapeshiftoss/blockbook'
import { ApiError } from '.'
import axios, { CreateAxiosDefaults, isAxiosError } from 'axios'
import axiosRetry, { isNetworkOrIdempotentRequestError } from 'axios-retry'

const MAX_PAGE_SIZE = 100

export function validatePageSize(pageSize: number): void {
  if (pageSize <= 0) throw new ApiError('Bad Request', 422, 'page size must be greater than 0')
  if (pageSize > MAX_PAGE_SIZE) throw new ApiError('Bad Request', 422, `Max allowed page size is ${MAX_PAGE_SIZE}`)
}

export const handleError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err

  if (isAxiosError(err)) {
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
    retries: config.retries ?? 5,
    retryDelay: (retryCount, err) => {
      // don't add delay on top of request timeout
      if (err.code === 'ECONNABORTED') return 0
      // add exponential delay for network errors
      return axiosRetry.exponentialDelay(retryCount, undefined, config.delayFactor ?? 500)
    },
    retryCondition: (err) =>
      isNetworkOrIdempotentRequestError(err) ||
      (!!err.response && err.response.status >= 400 && err.response.status < 600),
  })

  return axiosWithRetry
}

export const exponentialDelay = async (retryCount: number) =>
  new Promise((resolve) => setTimeout(resolve, axiosRetry.exponentialDelay(retryCount, undefined, 500)))

let _rpcId = Math.floor(Math.random() * 1e6)
export const rpcId = (): number => {
  _rpcId = (_rpcId + 1) & 0x7fffffff
  if (_rpcId === 0) _rpcId = 1
  return _rpcId
}
