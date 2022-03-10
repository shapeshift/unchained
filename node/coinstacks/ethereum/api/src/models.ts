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
   * @returns {Promise<GasFees>} current fees specified in wei
   */
  // @Get('/gas/fees')
  getGasFees(): Promise<GasFees>

  // !IMPORTANT: temporary location for getTxHistory method to prevent type
  // interference with bitcoin api
  // TODO: move to BaseApi when bitcoin api is ready

  /**
   * Get transaction history by address or xpub
   *
   * @param {string} pubkey account address or xpub
   * @param {string} [cursor] page cursor
   * @param {number} [pageSize] page size
   *
   * @returns {Promise<TxHistory>} transaction history
   */
  // @Get('account/{pubkey}/txs')
  getTxHistory(pubkey: string, cursor?: string, pageSize?: number): Promise<TxHistory>
}

/**
 * Contains data about a token transfer
 */
export interface TokenTransfer extends Token {
  from: string
  to: string
  value: string
}

/**
 * Ethereum transaction
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
 * Ethereum transaction list ordered by block number
 */
export interface EthereumTxHistory extends TxHistory {
  txs: Array<EthereumTx>
}