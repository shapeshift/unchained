/* unable to import models from a module with tsoa */
import { Account } from '../../../common/api/src'

/**
 * Contains info about current recommended fees to use in a transaction
 */
export interface FeeData {
  gasPrice: string
  maxFeePerGas: string
  maxPriorityFeePerGas: string
}

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
 * Contains ethereum specific transaction info as returned from the node
 */
export interface EthereumTxSpecific {
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
 * EthereumAPI coin specific implementation
 */
export interface EthereumAPI {
  /**
   * Get the estimated gas cost of a transaction
   *
   * @param {string} data input data
   * @param {string} from from address
   * @param {string} to to address
   * @param {string} value transaction value in wei
   *
   * @returns {Promise<string>} estimated gas cost
   */
  //@Get('/gas/estimate')
  estimateGas(data: string, from: string, to: string, value: string): Promise<string>

  /**
   * Get the current recommended gas fees to use in a transaction
   *
   * * For EIP-1559 transactions, use `maxFeePerGas` and `maxPriorityFeePerGas`
   * * For Legacy transactions, use `gasPrice`
   *
   * @returns {Promise<FeeData>} current fees specified in wei
   */
  // @Get('/gas/fees')
  getGasPrice(): Promise<FeeData>
}
