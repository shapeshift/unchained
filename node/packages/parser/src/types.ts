export enum Dex {
  Thor = 'thor',
  Zrx = 'zrx',
}

export interface Fee {
  caip19: string
  value: string
}

export interface SequencedTx extends TxBase {
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

export interface TxMetaData {
  buyTx: Transfer | undefined
  sellTx: Transfer | undefined
}

export interface TxBase {
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
  data?: TxMetaData
}

export interface UniV2Tx extends TxBase {
  data?: TxMetaData // TODO = Type and extend any specific properties
}

export interface ZrxTx extends TxBase {
  data?: TxMetaData // TODO = Type and extend any specific properties
}

export interface ThorTx extends TxBase {
  data?: TxMetaData // TODO = Type and extend any specific properties
}

// TODO - Add ZrxTx, ThorTx, YearnTx etc

export type Tx = UniV2Tx | ZrxTx | ThorTx

export type TxSpecific<T extends Tx> = Partial<Pick<T, 'trade' | 'transfers' | 'data'>>
