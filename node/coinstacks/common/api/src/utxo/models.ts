import { BaseAccount, BaseTx, BaseTxHistory } from '../models' // unable to import models from a module with tsoa

/**
 * Contains info about a transaction input
 */
export interface Vin {
  txid?: string
  vout?: string
  sequence?: number
  coinbase?: string
  scriptSig?: {
    hex?: string
  }
  addresses?: Array<string>
  value?: string
}

/**
 * Contains info about a transaction output
 */
export interface Vout {
  value: string
  n: number
  opReturn?: string
  scriptPubKey: {
    hex?: string
  }
  addresses?: Array<string>
}

/**
 * Contains info about a transaction
 */
export interface Tx extends BaseTx {
  vin: Array<Vin>
  vout: Array<Vout>
  confirmations: number
  value: string
  fee: string
  hex: string
}

/**
 * Contains info about transaction history
 */
export type TxHistory = BaseTxHistory<Tx>

/**
 * Contains info about a transaction as returned from the node
 */
export interface RawTx {
  txid: string
  hash: string
  version: number
  size: number
  vsize: number
  weight: number
  locktime: number
  vin: Array<{
    txid?: string
    vout?: number
    sequence?: number
    coinbase?: string
    scriptSig?: {
      asm: string
      hex: string
    }
    txinwitness?: string
  }>
  vout: Array<{
    value?: string | number
    n?: number
    scriptPubKey?: {
      asm: string
      hex: string
      reqSigs: number
      type: string
      addresses: string[]
    }
  }>
  hex: string
  blockhash: string
  confirmations: number
  time: number
  blocktime: number
}

/**
 * Contains info about an unspent transaction output
 */
export interface Utxo {
  txid: string
  vout: number
  value: string
  height?: number
  confirmations: number
  address?: string
  path?: string
  locktime?: number
  coinbase?: boolean
}

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
export interface Account extends BaseAccount {
  /**
   * List of associated addresses for an extended public key
   */
  addresses?: Array<Address>

  /**
   * The next unused receive address index for an extended public key (change index 0)
   */
  nextReceiveAddressIndex?: number

  /**
   * The next unused change address index for an extended public key (change index 1)
   */
  nextChangeAddressIndex?: number
}

/**
 * Contains info about the network fee
 */
export type NetworkFee = {
  blocksUntilConfirmation: number
  satsPerKiloByte: number
}

/**
 * Contains info about current recommended network fees
 */
export interface NetworkFees {
  fast?: NetworkFee
  average?: NetworkFee
  slow?: NetworkFee
}

/**
 * Extended coin specific functionality
 */
export interface API {
  /**
   * Get all unspent transaction outputs for an address or extended public key
   *
   * @param {string} pubkey account address or extended public key
   *
   * @returns {Promise<Array<Utxo>>} account utxos
   */
  // @Get('account/{pubkey}/utxos')
  getUtxos(pubkey: string): Promise<Array<Utxo>>

  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<Tx>} transaction payload
   */
  // @Get('tx/{txid}')
  getTransaction(txid: string): Promise<Tx>

  /**
   * Get raw transaction details directly from the node
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<RawTx>} transaction payload
   */
  // @Get('tx/{txid}/raw')
  getRawTransaction(txid: string): Promise<RawTx>

  /**
   * Get current recommended network fees to use in a transaction
   *
   * @returns {Promise<NetworkFees>} current network fees
   */
  //@Get('/fees')
  getNetworkFees(): Promise<NetworkFees>
}
