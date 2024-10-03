import { BaseAccount, BaseTx, BaseTxHistory } from '../../../common/api/src' // unable to import models from a module with tsoa

/**
 * Contains info about a transaction
 */
export interface Tx extends BaseTx {}

/**
 * Contains info about transaction history
 */
export type TxHistory = BaseTxHistory<Tx>

/**
 * Contains info about an address associated with an extended public key
 */
export interface Address {
  balance: string
  pubkey: string
}

/**
 * Contains info about an address or extended public key account
 */
export interface Account extends BaseAccount {}

/**
 * Extended coin specific functionality
 */
export interface API {
  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<Tx>} transaction payload
   */
  // @Get('tx/{txid}')
  getTransaction(txid: string): Promise<Tx>
}

/**
 * Contains info about current recommended priority fees for a transaction to land.
 */
export interface PriorityFees {
  // base fee per signature
  baseFee: number
  // slow confirmation speed estimation
  slow: number
  // average confirmation speed estimation
  average: number
  // average confirmation speed estimation
  fast: number
}

// Geyser Types
export interface GeyserWebsocketResponse {
  jsonrpc: string
  method: string
  params: GeyserParams
}

export interface GeyserParams {
  subscription: number
  result: GeyserResult
}

export interface GeyserResult {
  transaction: GeyserResultTransaction
  signature: string
  slot: number
}

export interface GeyserResultTransaction {
  transaction: GeyserTransactionDetails
  meta: GeyserTransactionMeta
  version: number
}

export interface GeyserTransactionMeta {
  err: null
  status: GeyserTransactionStatus
  fee: number
  preBalances: number[]
  postBalances: number[]
  innerInstructions: GeyserInnerInstruction[]
  logMessages: string[]
  preTokenBalances: GeyserTokenBalance[]
  postTokenBalances: GeyserTokenBalance[]
  rewards: unknown[]
  computeUnitsConsumed: number
}

export interface GeyserInnerInstruction {
  index: number
  instructions: GeyserInnerInstructionDetails[]
}

export interface GeyserInnerInstructionDetails {
  program?: string
  programId: string
  parsed?: GeyserParsedInstruction
  stackHeight: number
  accounts?: string[]
  data?: string
}

export interface GeyserParsedInstruction {
  info: GeyserParsedInstructionInfo
  type: string
}

export interface GeyserParsedInstructionInfo {
  extensionTypes?: string[]
  mint?: string
  lamports?: number
  newAccount?: string
  owner?: string
  source?: string
  space?: number
  account?: string
  amount?: string
  authority?: string
  destination?: string
}

export interface GeyserTokenBalance {
  accountIndex: number
  mint: string
  uiTokenAmount: GeyserUITokenAmount
  owner: string
  programId: string
}

export interface GeyserUITokenAmount {
  uiAmount: number
  decimals: number
  amount: string
  uiAmountString: string
}

export interface GeyserTransactionStatus {
  Ok: null
}

export interface GeyserTransactionDetails {
  signatures: string[]
  message: GeyserTransactionMessage
}

export interface GeyserTransactionMessage {
  accountKeys: GeyserAccountKey[]
  recentBlockhash: string
  instructions: GeyserMessageInstruction[]
  addressTableLookups: unknown[]
}

export interface GeyserAccountKey {
  pubkey: string
  writable: boolean
  signer: boolean
  source: GeyserAccountSource
}

export enum GeyserAccountSource {
  Transaction = 'transaction',
}

export interface GeyserMessageInstruction {
  programId: string
  accounts?: string[]
  data?: string
  stackHeight: null
  program?: string
  parsed?: GeyserParsedMessageInstruction
}

export interface GeyserParsedMessageInstruction {
  info: GeyserParsedMessageInstructionInfo
  type: string
}

export interface GeyserParsedMessageInstructionInfo {
  account?: string
  mint?: string
  source: string
  systemProgram?: string
  tokenProgram?: string
  wallet?: string
  destination?: string
  lamports?: number
}

/**
 * Contains the base64 encoded transaction message
 */
export interface EstimateFeesBody {
  message: string
}
