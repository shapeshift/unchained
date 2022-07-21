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
 * Contains info about a BitcoinCash transaction
 */
export interface BitcoinCashTx extends BaseTx {
  vin: Array<Vin>
  vout: Array<Vout>
  confirmations: number
  value: string
  fee: string
  hex: string
}

/**
 * Contains info about BitcoinCash transaction history
 */
export type BitcoinCashTxHistory = BaseTxHistory<BitcoinCashTx>

/**
 * Contains BitcoinCash specific transaction info as returned from the node
 */
export interface BitcoinCashRawTx {
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

export interface BitcoinCashAddress {
  balance: string
  pubkey: string
}

/**
 * Contains additional BitcoinCash specific account info
 */
export interface BitcoinCashAccount extends BaseAccount {
  /**
   * List of associated addresses for an xpub
   */
  addresses?: Array<BitcoinCashAddress>

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
 * BitcoinCashAPI coin specific implementation
 */
export interface BitcoinCashAPI {
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
   * @returns {Promise<BitcoinCashTx>} transaction payload
   */
  // @Get('tx/{txid}')
  getTransaction(txid: string): Promise<BitcoinCashTx>

  /**
   * Get raw transaction details directly from the node
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<BitcoinCashRawTx>} transaction payload
   */
  // @Get('tx/{txid}/raw')
  getRawTransaction(txid: string): Promise<BitcoinCashRawTx>

  /**
   * Get current network fees
   *
   * @returns {Promise<NetworkFees>} network fees
   */
  // @Get('fees')
  getNetworkFees(): Promise<NetworkFees>
}
