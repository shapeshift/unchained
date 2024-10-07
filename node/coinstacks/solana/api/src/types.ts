import { ParsedTransactionWithMeta } from '@solana/web3.js'

export type Transaction = Omit<ParsedTransactionWithMeta, 'slot'>

export interface WebsocketSubscribeResponse {
  jsonrpc: '2.0'
  method: string
  result: number
}

export interface WebsocketResponse {
  jsonrpc: '2.0'
  method: string
  params: Params
}

interface Params {
  subscription: number
  result: Result
}

interface Result {
  transaction: Transaction
  signature: string
  slot: number
}

export const isWebsocketResponse = (data: unknown): data is WebsocketResponse => {
  return Boolean(typeof data === 'object' && data && 'method' in data && 'params' in data)
}

export const isWebsocketSubscribeResponse = (data: unknown): data is WebsocketSubscribeResponse => {
  return Boolean(typeof data === 'object' && data && 'result' in data)
}
