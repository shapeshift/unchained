export enum Dex {
  Thor = 'thor',
  Zrx = 'zrx',
}

export interface Fee {
  caip19: string
  value: string
}

export interface Token {
  contract: string
  decimals: number
  name: string
}

export interface Trade {
  dexName: Dex
  fee?: Fee
  liquidityFee?: string
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

export interface Tx {
  address: string
  blockHash?: string
  blockHeight: number
  blockTime: number
  caip2: string
  fee?: Fee
  trade?: Trade
  transfers: Array<Transfer>
  txid: string
  value: string
}

export type TxSpecific = Partial<Pick<Tx, 'fee' | 'trade' | 'transfers'>>
