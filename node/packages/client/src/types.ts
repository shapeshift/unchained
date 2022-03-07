import * as ethereum from './ethereum/types'

export enum Dex {
  Thor = 'thor',
  Zrx = 'zrx',
}

export interface Fee {
  caip19: string
  value: string
}

export type SequencedTx = Tx & {
  sequence: number
  total: number
}

export enum Status {
  Confirmed = 'confirmed',
  Pending = 'pending',
  Failed = 'failed',
  Unknown = 'unknown',
}

export interface Token {
  contract: string
  decimals: number
  name: string
  symbol: string
}

export interface Trade {
  dexName: Dex
  memo?: string
  type: TradeType
}

export enum TradeType {
  Trade = 'trade',
  Refund = 'refund',
}

export interface Transfer {
  from: string
  to: string
  caip19: string
  type: TransferType
  totalValue: string
  components: Array<{ value: string }>
  token?: Token
}

export enum TransferType {
  Send = 'send',
  Receive = 'receive',
}

export interface TxMetadata {
  method?: string
  parser: string
}

export interface StandardTx {
  address: string
  blockHash?: string
  blockHeight: number
  blockTime: number
  caip2: string
  confirmations: number
  fee?: Fee
  status: Status
  trade?: Trade
  transfers: Array<Transfer>
  txid: string
  value: string
  data?: TxMetadata
}

export type Tx = StandardTx | ethereum.UniV2Tx | ethereum.ZrxTx | ethereum.ThorTx

export type TxSpecific<T extends Tx> = Partial<Pick<T, 'trade' | 'transfers' | 'data'>>

export interface GenericParser<T> {
  parse: (tx: T) => Promise<TxSpecific<Tx> | undefined>
}
