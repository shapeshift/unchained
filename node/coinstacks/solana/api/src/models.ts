import { EnrichedTransaction } from 'helius-sdk'
import { BaseAccount, BaseTx, BaseTxHistory } from '../../../common/api/src' // unable to import models from a module with tsoa

/**
 * Contains info about a transaction
 */
export type Tx = BaseTx & EnrichedTransaction

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
 * Contains info about a token
 */
export interface Token {
  id: string
  decimals: number
  name: string
  symbol: string
  type: string
}

/**
 * Contains info about a token including balance for an address
 */
export interface TokenBalance extends Token {
  balance: string
}

/**
 * Contains info about an address or extended public key account
 */
export interface Account extends BaseAccount {
  tokens: Array<TokenBalance>
}

/**
 * Contains info about current recommended priority fees for a transaction to land.
 */
export interface PriorityFees {
  // base fee per signature
  baseFee: string
  // slow confirmation speed estimation
  slow: string
  // average confirmation speed estimation
  average: string
  // average confirmation speed estimation
  fast: string
}

/**
 * Contains the base64 encoded serialized transaction
 */
export type EstimateFeesBody =
  | {
      serializedTx: string
    }
  | {
      message: string
    }

/**
 * Extended coin specific functionality
 */
export interface API {
  /**
   * Get transaction details
   *
   * @param {string} txid transaction signature
   *
   * @returns {Promise<Tx>} transaction payload
   */
  // @Get('tx/{txid}')
  getTransaction(txid: string): Promise<Tx>
}
