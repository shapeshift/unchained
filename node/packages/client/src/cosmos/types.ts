import { StandardTx, StandardTxMetadata } from '../types'

export interface TxMetadata extends StandardTxMetadata {
  parser: 'cosmos'
  delegator?: string
  sourceValidator?: string
  destinationValidator?: string
  caip19?: string
  value?: string
}

export interface ParsedTx extends StandardTx {
  data?: TxMetadata
}
