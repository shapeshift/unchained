/* unable to import models from a module with tsoa */
import { Balance } from '../../../common/api/src'

/**
 * Contains info about a token including balance for an address
 */
export interface Token {
  type: string
  name: string
  contract: string
  symbol: string
  decimals: number
  balance: string
}

/**
 * Contains additional ethereum specific balance info
 */
export interface EthereumBalance extends Balance {
  tokens: Array<Token>
}

/**
 * EthereumAPI coin specific implementation
 */
export interface EthereumAPI {
  /**
   * Get the estimated gas cost of a transaction
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
   * Get the current nonce of an address
   *
   * @param address account address
   *
   * @returns {Promise<number>} account nonce
   */
  // @Get('nonce/{address}')
  getNonce(address: string): Promise<number>
}
