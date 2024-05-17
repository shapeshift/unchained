import { BaseAccount, BaseInfo, SendTxBody, BaseTxHistory } from './models'

export * from './models'
export * as middleware from './middleware'
export * from './websocket'
export * from './registry'
export * from './types'
export * from './prometheus'
export * from './utils'

export * as evm from './evm'
export * as utxo from './utxo'

/**
 * Generic api error for handling failed requests
 */
export class ApiError extends Error {
  statusText: string
  statusCode: number

  constructor(statusText: string, statusCode: number, message?: string) {
    super(message)
    this.name = this.constructor.name
    this.statusText = statusText
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
   * @returns {Promise<BaseInfo>} coinstack info
   */
  // @Get('info/')
  getInfo(): Promise<BaseInfo>

  /**
   * Get account details by address or extended public key
   *
   * @param {string} pubkey account address or extended public key
   *
   * @returns {Promise<BaseAccount>} account details
   */
  // @Get('account/{pubkey}')
  getAccount(pubkey: string): Promise<BaseAccount>

  /**
   * Get transaction history by address or extended public key
   *
   * @param {string} pubkey account address or extended public key
   * @param {string} [cursor] the cursor returned in previous query
   * @param {number} [pageSize] page size
   *
   * @returns {Promise<BaseTxHistory>} transaction history
   */
  // @Get('account/{pubkey}/txs')
  getTxHistory(pubkey: string, cursor?: string, pageSize?: number): Promise<BaseTxHistory>

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
