import { ParsedTransactionWithMeta } from '@solana/web3.js'

export type Transaction = Omit<ParsedTransactionWithMeta, 'slot'>

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
