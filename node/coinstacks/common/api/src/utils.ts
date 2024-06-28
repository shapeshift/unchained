import { ApiError as BlockbookApiError } from '@shapeshiftoss/blockbook'
import { ApiError } from '.'
import { isAxiosError } from 'axios'

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
