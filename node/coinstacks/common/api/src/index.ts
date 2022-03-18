import { Account, Info, SendTxBody, TxHistory } from './models'

export * from './models'
export * as middleware from './middleware'
export * from './websocket'

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
 * BaseAPI implementation which all coinstacks must conform to.
 *
 * Included are doc comments and a the route decorator (@Get, @Post, etc)
 * The route decorator is commented out in the interface, but should be used in the implementation class.
 *
 * Typescript is unable to enforce decorators on interface functions and
 * also will not enforce more than the first argument for each function.
 * Please ensure these match when adding a new coinstack api,
 * or update all coinstack api implementations on any changes to the base interface.
 */
export interface BaseAPI {
  /**
   * Get information about the running coinstack
   *
   * @returns {Promise<Info>} coinstack info
   */
  // @Get('info/')
  getInfo(): Promise<Info>

  /**
   * Get account details by address or xpub
   *
   * @param {string} pubkey account address or xpub
   *
   * @returns {Promise<Account>} account details
   */
  // @Get('account/{pubkey}')
  getAccount(pubkey: string): Promise<Account>

  /**
   * Get transaction history by address or xpub
   *
   * @param {string} pubkey account address or xpub
   * @param {string} [cursor] the cursor returned in previous query
   * @param {number} [pageSize] page size
   *
   * @returns {Promise<TxHistory>} transaction history
   */
  // @Get('account/{pubkey}/txs')
  getTxHistory(pubkey: string, cursor?: string, pageSize?: number): Promise<TxHistory>

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {SendTxBody} body serialized raw transaction hex
   *
   * @returns {Promise<string>} transaction id
   */
  // @Post('sendTx/')
  sendTx(body: SendTxBody): Promise<string>
}
