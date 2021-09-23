/* unable to import models from a module with tsoa */
import { Account } from '../../../common/api/src'

/**
 * Contains info about a token including balance for an address
 */
export interface Token {
  balance: string
  contract: string
  decimals: number
  name: string
  symbol: string
  type: string
}

/**
 * Contains additional ethereum specific info
 */
export interface EthereumAccount extends Account {
  nonce: number
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
  //@Get('/gas/estimate')
  estimateGas(data: string, to: string, value: string): Promise<string>

  /**
   * Get the current gas price from the node
   *
   * @returns {Promise<string>} current gas price in wei
   */
  // @Get('/gas/price')
  getGasPrice(): Promise<string>
}
