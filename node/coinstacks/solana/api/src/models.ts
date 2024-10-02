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
