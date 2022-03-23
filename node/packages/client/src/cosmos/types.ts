import { StandardTx, StandardTxMetadata } from '../types'

export interface TxMetadata extends StandardTxMetadata {
  parser: 'cosmos'
  delegator?: string
  validator?: string
  caip19?: string
  from?: string
  to?: string
  value?: string
}

export interface ParsedTx extends StandardTx {
  data?: TxMetadata
}

export type TxSpecific = Partial<Pick<ParsedTx, 'trade' | 'transfers' | 'data'>>
