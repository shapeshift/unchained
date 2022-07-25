/* unable to import models from a module with tsoa */
import { BaseAccount, BaseTx, BaseTxHistory } from '../../../common/api/src'

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
 * Contains info about a Litecoin transaction
 */
export interface LitecoinTx extends BaseTx {
  vin: Array<Vin>
  vout: Array<Vout>
  confirmations: number
  value: string
  fee: string
  hex: string
}

/**
 * Contains info about Litecoin transaction history
 */
export type LitecoinTxHistory = BaseTxHistory<LitecoinTx>

/**
 * Contains Litecoin specific transaction info as returned from the node
 */
export interface LitecoinRawTx {
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

export interface LitecoinAddress {
  balance: string
  pubkey: string
}

/**
 * Contains additional Litecoin specific account info
 */
export interface LitecoinAccount extends BaseAccount {
  /**
   * List of associated addresses for an xpub
   */
  addresses?: Array<LitecoinAddress>

  /**
   * The next unused receive address index for an xpub (change index 0)
   */
  nextReceiveAddressIndex?: number

  /**
   * The next unused change address index for an xpub (change index 1)
   */
  nextChangeAddressIndex?: number
}

/**
 * Contains network fee info
 */
export type NetworkFee = {
  blocksUntilConfirmation: number
  satsPerKiloByte: number
}

/**
 * Gets current network fee estimates
 */
export interface NetworkFees {
  fast?: NetworkFee
  average?: NetworkFee
  slow?: NetworkFee
}

/**
 * LitecoinAPI coin specific implementation
 */
export interface LitecoinAPI {
  /**
   * Get all unspent transaction outputs for a pubkey
   *
   * @param pubkey account pubkey
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
   * @returns {Promise<LitecoinTx>} transaction payload
   */
  // @Get('tx/{txid}')
  getTransaction(txid: string): Promise<LitecoinTx>

  /**
   * Get raw transaction details directly from the node
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<LitecoinRawTx>} transaction payload
   */
  // @Get('tx/{txid}/raw')
  getRawTransaction(txid: string): Promise<LitecoinRawTx>

  /**
   * Get current network fees
   *
   * @returns {Promise<NetworkFees>} network fees
   */
  // @Get('fees')
  getNetworkFees(): Promise<NetworkFees>
}
