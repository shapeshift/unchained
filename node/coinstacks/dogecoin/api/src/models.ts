/* unable to import models from a module with tsoa */
import { Account, Tx, TxHistory } from '../../../common/api/src'

/**
 * Contains info about a Bitcoin transaction input
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
 * Contains info about a Bitcoin transaction output
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
 * Contains info about a Bitcoin transaction
 */
export interface BitcoinTx extends Tx {
  vin: Array<Vin>
  vout: Array<Vout>
  confirmations: number
  value: string
  fee: string
  hex: string
}

/**
 * Contains info about Bitcoin transaction history
 */
export interface BitcoinTxHistory extends TxHistory {
  txs: Array<BitcoinTx>
}

/**
 * Contains Bitcoin specific transaction info as returned from the node
 */
export interface BitcoinRawTx {
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

export interface BitcoinAddress {
  balance: string
  pubkey: string
}

/**
 * Contains additional Bitcoin specific account info
 */
export interface BitcoinAccount extends Account {
  /**
   * List of associated addresses for an xpub
   */
  addresses?: Array<BitcoinAddress>

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
 * BitcoinAPI coin specific implementation
 */
export interface BitcoinAPI {
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
   * @returns {Promise<BitcoinTx>} transaction payload
   */
  // @Get('tx/{txid}')
  getTransaction(txid: string): Promise<BitcoinTx>

  /**
   * Get raw transaction details directly from the node
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<BitcoinRawTx>} transaction payload
   */
  // @Get('tx/{txid}/raw')
  getRawTransaction(txid: string): Promise<BitcoinRawTx>

  /**
   * Get current network fee estimates from Blockbook
   *
   * @returns {Promise<BTCNetworkFees>} network fee estimates
   */
  getNetworkFees(): Promise<BTCNetworkFees>
}

/**
 * Information about BTC network fee at a specific confirmation speed
 */
export type BTCNetworkFee = {
  blocksUntilConfirmation: number
  satsPerKiloByte: number
}

/**
 * Gets current network fee estimates for 'fast', 'average', and 'slow' tx confirmation times
 */
//@Get('/fees')
export interface BTCNetworkFees {
  fast?: BTCNetworkFee
  average?: BTCNetworkFee
  slow?: BTCNetworkFee
}
