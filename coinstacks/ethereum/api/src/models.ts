/* unable to import models from a module with tsoa */
import { Balance } from '../../../common/api/src'

/**
 * Contains info about tokens held by an address
 */
export interface Token {
  type: string
  name: string
  path?: string
  contract?: string
  transfers: number
  symbol?: string
  decimals?: number
  balance?: string
  totalReceived?: string
  totalSent?: string
}

/**
 * Contains additional ethereum specific balance info
 */
export interface EthereumBalance extends Balance {
  tokens: Token[]
}

/**
 * EthereumAPI coin specific implementation
 */
export interface EthereumAPI {
  /**
   * Get estimated gas cost for a transaction
   *
   * @param {string} data input data
   * @param {string} to to address
   * @param {string} value transaction value
   *
   * @returns {Promise<string>} estimated gas to be used for the transaction
   */
  //@Get('/estimate-gas')
  estimateGas(data: string, to: string, value: string): Promise<string>

  /**
   * Get the current gas price from the node
   *
   * @returns {Promise<string>} current gas price in wei
   */
  // @Get('/gas-price')
  getGasPrice(): Promise<string>

  /**
   * Returns the nonce of an address
   *
   * @param address account address
   *
   * @returns {Promise<number>} account nonce
   */
  // @Get('nonce/{address}')
  getNonce(address: string): Promise<number>
}
