import { RegistryDocument } from '@shapeshiftoss/common-mongo'

export interface ParseTx extends ParseTxUnique {
  address: string
  fee?: TxFee
  receive: TxTransfers
  send: TxTransfers
}

// Contains data about unique transaction events
export interface ParseTxUnique {
  refund?: Refund
  send?: TxTransfers
  trade?: Trade
}

// Contains data about a dex refund
export interface Refund {
  dexName: 'zrx' | 'thor'
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

// Contains data for managing client registration state
export interface RegistryMessage extends RegistryDocument {
  action: string
}

// Contains data about a detected reorg block (orphan/uncle)
export interface ReorgBlock {
  hash: string
  height: number
  prevHash: string
}

export interface RPCRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params: [string]
}

export interface RPCResponse {
  jsonrpc: '2.0'
  id: string
  result?: unknown
  error?: Record<string, unknown>
}

// Contains data required to perform an address delta sync
export interface SyncTx {
  address: string
  client_id: string
  txid: string
}

// Contains data about a token
export interface Token {
  contract: string
  decimals: number
  name: string
}

// Contains data about a dex trade
export interface Trade {
  dexName: 'zrx' | 'thor'
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

// Contains data about the transaction fee
export interface TxFee {
  symbol: string
  value: string
}

// Contains data about a transfer of value in a transaction
export interface TxTransfer {
  token?: Token
  totalValue: string
  components: Array<{
    value: string
  }>
}

export type TxTransfers = Record<string, TxTransfer>
