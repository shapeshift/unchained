/* unable to import models from a module with tsoa */
import { Balance } from '../../../common/api/src'

/**
 * Contains additional bitcoin specific balance info
 */
export interface BitcoinBalance extends Balance {
  addresses?: Array<Balance>
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
  // @Get('utxos/{pubkey}')
  getUtxos(pubkey: string): Promise<Array<Utxo>>
}
