/* unable to import models from a module with tsoa */
import { Account, Tx, TxHistory } from '../../../common/api/src'

/**
 * Contains info about current recommended fees to use in a transaction
 */
export interface GasFees {
  gasPrice: string
  maxFeePerGas: string
  maxPriorityFeePerGas: string
}

/**
 * Contains info about a token
 */
export interface Token {
  contract: string
  decimals: number
  name: string
  symbol: string
  type: string
}

/**
 * Contains info about a token including balance for an address
 */
export interface TokenBalance extends Token {
  balance: string
}

/**
 * Contains info about a token including transfer details
 */
export interface TokenTransfer extends Token {
  from: string
  to: string
  value: string
}

/**
 * Contains additional ethereum specific info
 */
export interface EthereumAccount extends Account {
  nonce: number
  tokens: Array<TokenBalance>
}

/**
 * Contains info about an Ethereum transaction
 */
export interface EthereumTx extends Tx {
  from: string
  to: string
  confirmations: number
  value: string
  fee: string
  gasLimit: string
  gasUsed?: string
  gasPrice: string
  status: number
  inputData?: string
  tokenTransfers?: Array<TokenTransfer>
}

/**
 * Contains info about Ethereum transaction history
 */
export interface EthereumTxHistory extends TxHistory {
  txs: Array<EthereumTx>
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
   * @returns {Promise<GasFees>} current fees specified in wei
   */
  // @Get('/gas/fees')
  getGasFees(): Promise<GasFees>
}
