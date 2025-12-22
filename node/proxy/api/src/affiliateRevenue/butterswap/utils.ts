import { BLOCK_TIME_SECONDS, MAP_RPC_URL } from './constants'
import type { RpcResponse } from './types'

export const rpcCall = async <T>(method: string, params: unknown[]): Promise<T> => {
  const response = await fetch(MAP_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  })

  const data: RpcResponse<T> = await response.json()

  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`)
  }

  return data.result
}

export const estimateBlockFromTimestamp = (
  currentBlock: number,
  currentTimestamp: number,
  targetTimestamp: number
): number => {
  const blocksAgo = Math.floor((currentTimestamp - targetTimestamp) / BLOCK_TIME_SECONDS)
  const estimatedBlock = currentBlock - blocksAgo
  return Math.max(0, Math.min(estimatedBlock, currentBlock))
}
