/* unable to import models from a module with tsoa */
import { Account } from '../../../common/api/src'

/**
 * Contains additional bitcoin specific info
 */
export interface BitcoinAccount extends Account {
  /**
   * Account details by address if BitcoinAccount was fetched by xpub
   */
  addresses?: Array<Account>

  /**
   * The next unused receive address if BitcoinAccount was fetched by xpub
   */
  receiveIndex?: number | null

  /**
   * The next unused change address if BitcoinAccount was fetched by xpub
   */
  changeIndex?: number | null
}

/**
 * Contains info about an unspent transaction output
 */
export interface Utxo {
  address: string
  confirmations: number
  txid: string
  value: string
  vout: number
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
}
