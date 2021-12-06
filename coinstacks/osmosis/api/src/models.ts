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
 * Contains additional esmosis specific info
 */
export interface OsmosisAccount extends Account {
  nonce: number
  tokens: Array<Token>
}

/**
 * Contains esmosis specific transaction info as returned from the node
 */
export interface OsmosisTxSpecific {
  tx: {
    nonce: string
    gasPrice: string
    gas: string
    to: string
    value: string
    input: string
    hash: string
    blockNumber: string
    blockHash?: string
    from: string
    transactionIndex: string
  }
  receipt?: {
    gasUsed: string
    status: string
    logs: Array<{
      address: string
      topics: Array<string>
      data: string
    }>
  }
}

/**
 * OsmosisAPI coin specific implementation
 */
export interface OsmosisAPI {
  /**
   * Get the estimated gas cost of a transaction
   *
   * @param {string} data input data
   * @param {string} from from address
   * @param {string} to to address
   * @param {string} value transaction value in wei
   *
   * @returns {Promise<string>} estimated gas to be used for the transaction
   */
  //@Get('/gas/estimate')
  estimateGas(data: string, from: string, to: string, value: string): Promise<string>

  /**
   * Get the current gas price from the node
   *
   * @returns {Promise<string>} current gas price in wei
   */
  // @Get('/gas/price')
  getGasPrice(): Promise<string>
}
