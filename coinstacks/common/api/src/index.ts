import { Controller } from 'tsoa'
import { RegistryDocument } from '@shapeshiftoss/common-mongo'
import { Account, BalanceChange, Block, RawTx, Tx, TxHistory, TxReceipt, Utxo } from './models'

export * from './models'
export * as middleware from './middleware'

export type Interval = 'weekly' | 'daily' | 'hourly' | '30min' | '15min' | '10min' | '5min' | '1min'

export const intervals = {
  weekly: 60 * 60 * 24 * 7,
  daily: 60 * 60 * 24,
  hourly: 60 * 60,
  '30min': 60 * 30,
  '15min': 60 * 15,
  '10min': 60 * 10,
  '5min': 60 * 5,
  '1min': 60 * 1,
}

/**
 * Generic api error for handling failed requests
 */
export class ApiError extends Error {
  statusCode: number
  constructor(name: string, statusCode: number, message?: string) {
    super(message)
    this.name = name
    this.statusCode = statusCode
  }
}

/**
 * Common API implementation which all coinstack OpenAPI Controllers must conform to.
 *
 * The route path is described in the comment before each api function.
 *
 * Typescript is unable to enforce decorators on abstract functions and also will not enforce more than the first argument for each function. Please ensure these match when adding a new coinstack api, or update all coinstack api implementations on any changes to the abstract class.
 */
export abstract class CommonAPI extends Controller {
  /**
   * Get Account information for a given address/pubKey
   *
   * @param {string} pubKey accounts address or an xpub
   *
   * @returns {Promise<Account>} account information
   */
  //  @Get('account/{address}')
  abstract getAccount(pubKey: string): Promise<Account>

  /**
   * Get balance history returns the balance history of an address
   *
   * @param {string} address account address
   * @param {Interval} interval range to group by
   * @param {number} [start] start date as unix timestamp
   * @param {number} [end] end date as unix timestamp
   *
   * @returns {Promise<Array<BalanceChange>>} balance change history
   */
  // @Get('balancehistory/{address}')
  abstract getBalanceHistory(
    address: string,
    interval: Interval,
    from?: number,
    to?: number
  ): Promise<Array<BalanceChange>>

  /**
   * Get block returns data about a block
   *
   * @param {(number|string)} block height or hash
   *
   * @returns {Promise<Block>} block data
   */
  // @Get('block/{block}')
  abstract getBlock(block: number | string): Promise<Block>

  /**
   * Get transaction returns data about a transaction
   *
   * @param {string} txid transaction id
   *
   * @returns {Promise<Tx>} transaction data
   */
  // @Get('tx/{txid}')
  abstract getTx(txid: string): Promise<Tx>

  /**
   * Get the current fee price (ex. gas price, sats/byte) from the network node.
   *
   * @returns {Promise<string>} current fee price for chain for next block confirmation
   *
   */
  abstract getFeePrice(): Promise<string>

  /**
   * Get transaction history returns the transaction history of an address
   *
   * @param {string} address account address
   * @param {number} [page] page number
   * @param {number} [pageSize] page number
   * @param {string} [contract] filter by contract address (only supported by coins which support contracts)
   *
   * @returns {Promise<TxHistory>} transaction history
   */
  // @Get('txs/{address}')
  abstract getTxHistory(address: string, page?: number, pageSize?: number, contract?: string): Promise<TxHistory>

  /**
   * Register addresses for tracking incoming pending transactions and newly confirmed transactions
   *
   * @param {RegistryDocument} document Contains a list of addresses to register for a client id
   *
   * @returns {Promise<void>}
   */
  // @Post('register/')
  abstract register(document: RegistryDocument): Promise<void>

  /**
   * Unregister addresses to stop tracking incoming pending transactions and newly confirmed transactions
   *
   * @param {RegistryDocument} document Contains a list of addresses to unregister for a client id. If no addresses are provided, all addresses will be unregistered.
   *
   * @returns {Promise<void>}
   */
  // @Post('unregister/')
  abstract unregister(document: RegistryDocument): Promise<void>

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {RawTx} rawTx serialized raw transaction hex
   *
   * @returns {Promise<TxReceipt>} transaction receipt
   */
  // @Post('sendTx/')
  abstract sendTx(rawTx: RawTx): Promise<TxReceipt>
}

export abstract class UtxoCommonAPI extends CommonAPI {
  /**
   * Get Utxo returns an array of unspent transaction outputs of address or xpub.
   *
   * @param {string} account address or xpub
   * @param {boolean} confirmed return confirmed and/or unconfirmed transactions
   *
   * @returns {Promise<Array<Utxo>>} utxo list
   */
  // @Get('utxo/{account}')
  abstract getUtxo(account: string): Promise<Array<Utxo>>
}
