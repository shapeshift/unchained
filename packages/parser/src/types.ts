export type AssetSymbol = string

export type Dex = 'thor' | 'zrx'

export interface ParseTx extends ParseTxUnique, Tx {
  address: string
  fee?: TxFee
  transfers: Array<TxTransfer>
}

export interface ParseTxUnique {
  refund?: Refund
  trade?: Trade
  transfers?: Array<TxTransfer>
}

export interface Refund {
  dexName: Dex
  refundAsset: string
  refundAmount: string
  refundNetwork?: string
  feeAsset: string
  feeAmount: string
  feeNetwork?: string
  memo?: string
  sellAsset: string
  sellAmount: string
  sellNetwork?: string
}

export interface Token {
  contract: string
  decimals: number
  name: string
}

export interface Trade {
  dexName: Dex
  buyAsset: string
  buyAmount: string
  buyNetwork?: string
  feeAsset: string
  feeAmount: string
  feeNetwork?: string
  liquidityFee?: string
  memo?: string
  sellAsset: string
  sellAmount: string
  sellNetwork?: string
}

export enum TransferType {
  Send = 'send',
  Receive = 'receive',
}

export interface Tx {
  txid: string
  blockHash?: string
  blockHeight: number
  blockTime: number
}

export interface TxFee {
  symbol: AssetSymbol
  value: string
}

export interface TxTransfer {
  from: string
  to: string
  symbol: AssetSymbol
  type: TransferType
  totalValue: string
  components: Array<{ value: string }>
  token?: Token
}
