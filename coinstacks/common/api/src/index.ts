import { Balance, BalanceChange, Block, RawTx, Tx, TxHistory } from './models'

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
export interface CommonAPI {
  /**
   * Get balance returns the balance of a pubkey
   *
   * @param {string} pubkey account pubkey
   *
   * @returns {Promise<Balance>} account balance
   */
  // @Get('balance/{pubkey}')
  getBalance(pubkey: string): Promise<Balance>

  /**
   * Get balance history returns the balance history of a pubkey
   *
   * @param {string} pubkey account pubkey
   * @param {Interval} interval range to group by
   * @param {number} [start] start date as unix timestamp
   * @param {number} [end] end date as unix timestamp
   *
   * @returns {Promise<Array<BalanceChange>>} balance change history
   */
  // @Get('balancehistory/{pubkey}')
  getBalanceHistory(pubkey: string, interval: Interval, from?: number, to?: number): Promise<Array<BalanceChange>>

  /**
   * Get block returns data about a block
   *
   * @param {(number|string)} block height or hash
   *
   * @returns {Promise<Block>} block data
   */
  // @Get('block/{block}')
  getBlock(block: number | string): Promise<Block>

  /**
   * Get the current fee price (ex. gas price, sats/byte) from the network node.
   *
   * @returns {Promise<string>} current fee price for chain for next block confirmation
   *
   */
  getFeePrice(): Promise<string>

  /**
   * Get transaction returns data about a transaction
   *
   * @param {string} txid transaction id
   *
   * @returns {Promise<Tx>} transaction data
   */
  // @Get('tx/{txid}')
  getTx(txid: string): Promise<Tx>

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
  getTxHistory(address: string, page?: number, pageSize?: number, contract?: string): Promise<TxHistory>

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {RawTx} rawTx serialized raw transaction hex
   *
   * @returns {Promise<TxReceipt>} transaction receipt
   */
  // @Post('sendTx/')
  sendTx(rawTx: RawTx): Promise<string>
}

//export interface UtxoCommonAPI extends CommonAPI {
//  /**
//   * Get Utxo returns an array of unspent transaction outputs of address or xpub.
//   *
//   * @param {string} account address or xpub
//   * @param {boolean} confirmed return confirmed and/or unconfirmed transactions
//   *
//   * @returns {Promise<Array<Utxo>>} utxo list
//   */
//  // @Get('utxo/{account}')
//  getUtxo(account: string): Promise<Array<Utxo>>
//}
