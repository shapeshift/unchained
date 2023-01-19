import { BaseAccount, BaseTx, BaseTxHistory } from '../models' // unable to import models from a module with tsoa

/**
 * Contains info about estimated gas cost of a transaction
 */
export interface GasEstimate {
  gasLimit: string
}

/**
 * Contains info about current recommended fees to use in a transaction
 */
export interface GasFees {
  gasPrice: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
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
 * Contains info about an EVM account
 */
export interface Account extends BaseAccount {
  nonce: number
  tokens: Array<TokenBalance>
}

/**
 * Contains info about an EVM transaction
 */
export interface Tx extends BaseTx {
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
  internalTxs?: Array<InternalTx>
}

/**
 * Contains info about an EVM internal transaction
 */
export interface InternalTx {
  from: string
  to: string
  value: string
}

/**
 * Contains info about EVM transaction history
 */
export type TxHistory = BaseTxHistory<Tx>

/**
 * Extended EVM specific functionality
 */
export interface API {
  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<Tx>} transaction payload
   */
  // @Get('tx/{txid}')
  getTransaction(txid: string): Promise<Tx>

  /**
   * Get the estimated gas cost of a transaction
   *
   * @param {string} data input data
   * @param {string} from from address
   * @param {string} to to address
   * @param {string} value transaction value in wei
   *
   * @returns {Promise<GasEstimate>} estimated gas cost
   */
  //@Get('/gas/estimate')
  estimateGas(data: string, from: string, to: string, value: string): Promise<GasEstimate>

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
