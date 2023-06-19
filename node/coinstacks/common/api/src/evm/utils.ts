import { ethers } from 'ethers'
import { ApiError as BlockbookApiError } from '@shapeshiftoss/blockbook'
import { ApiError } from '../'

export const formatAddress = (address: string): string => ethers.utils.getAddress(address)

export const handleError = (err: unknown): ApiError => {
  if (err instanceof BlockbookApiError) {
    return new ApiError(err.response?.statusText ?? 'Internal Server Error', err.response?.status ?? 500, err.message)
  }

  if (err instanceof Error) {
    return new ApiError('Internal Server Error', 500, err.message)
  }

  return new ApiError('Internal Server Error', 500, 'unknown error')
}
