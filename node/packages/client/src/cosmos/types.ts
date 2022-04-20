import { StandardTx, StandardTxMetadata } from '../types'

export interface TxMetadata extends Omit<StandardTxMetadata, 'parser'> {
  parser: 'cosmos'
  delegator?: string
  sourceValidator?: string
  destinationValidator?: string
  caip19?: string
  value?: string
  ibcDestination?: string
  ibcSource?: string
}

export interface ParsedTx extends StandardTx {
  data?: TxMetadata
}
