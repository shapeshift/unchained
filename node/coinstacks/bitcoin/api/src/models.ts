/* unable to import models from a module with tsoa */
import { Account } from '../../../common/api/src'

/**
 * Contains info about a transaction
 */
 export interface BtcTx {
  txid: string
  status: string
  blockHash?: string
  blockHeight?: number
  confirmations?: number
  timestamp?: number
  from: string
  to?: string
  value: string
  fee: string
}

/**
 * Contains bitcoin specific transaction info as returned from the node
 */
export interface BitcoinTxSpecific {
  txid: string
  hash: string
  version: number
  size: number
  vsize: number
  weight: number
  locktime: number
  vin: Array<{
    txid?: string
    vout?: number
    sequence?: number
    coinbase?: string
    scriptSig?: {
      asm: string
      hex: string
    }
    txinwitness?: string
  }>
  vout: Array<{
    value?: string | number
    n?: number
    scriptPubKey?: {
      asm: string
      hex: string
      reqSigs: number
      type: string
      addresses: string[]
    }
  }>
  hex: string
  blockhash: string
  confirmations: number
  time: number
  blocktime: number
}

/**
 * Contains info about an unspent transaction output
 */
export interface Utxo {
  txid: string
  vout: number
  value: string
  height?: number
  confirmations: number
  address?: string
  path?: string
  locktime?: number
  coinbase?: boolean
}

export interface BitcoinAddress {
  balance: string
  pubkey: string
}

/**
 * Contains additional bitcoin specific account info
 */
export interface BitcoinAccount extends Account {
  /**
   * List of associated addresses for an xpub
   */
  addresses?: Array<BitcoinAddress>

  /**
   * The next unused receive address index for an xpub (change index 0)
   */
  nextReceiveAddressIndex?: number

  /**
   * The next unused change address index for an xpub (change index 1)
   */
  nextChangeAddressIndex?: number
}

/**
 * Contains paginated transaction history
 */
 export interface BtcTxHistory {
  // from Pagination
  page: number
  totalPages: number
  // from TxHistory
  txs: number
  transactions: Array<BtcTx>
}

/**
 * BitcoinAPI coin specific implementation
 */
export interface BitcoinAPI {
  /**
   * Get all unspent transaction outputs for a pubkey
   *
   * @param pubkey account pubkey
   *
   * @returns {Promise<Array<Utxo>>} account utxos
   */
  // @Get('account/{pubkey}/utxos')
  getUtxos(pubkey: string): Promise<Array<Utxo>>

  /**
   * Get transaction specific data directly from the node
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<BitcoinTxSpecific>} transaction payload
   */
  // @Get('transaction/{txid}')
  getTransaction(txid: string): Promise<BitcoinTxSpecific>

  /**
   * Get current network fee estimates from Blockbook
   *
   * @returns {Promise<BTCNetworkFees>} network fee estimates
   */
  getNetworkFees(): Promise<BTCNetworkFees>

  // !IMPORTANT: pulled from BaseApi to prevent type conflict with ethereum
 /**
  * Get transaction history by address or xpub
  *
  * @param {string} pubkey account address or xpub
  * @param {number} [page] page number
  * @param {number} [pageSize] page size
  * @param {string} [contract] filter by contract address (only supported by coins which support contracts)
  *
  * @returns {Promise<TxHistory>} transaction history
  */
  // @Get('account/{pubkey}/txs')
  getTxHistory(pubkey: string, page?: number, pageSize?: number, contract?: string): Promise<BtcTxHistory>

}

/**
 * Information about BTC network fee at a specific confirmation speed
 */
export type BTCNetworkFee = {
  blocksUntilConfirmation: number
  satsPerKiloByte: number
}

/**
 * Gets current network fee estimates for 'fast', 'average', and 'slow' tx confirmation times
 */
//@Get('/fees')
export interface BTCNetworkFees {
  fast?: BTCNetworkFee
  average?: BTCNetworkFee
  slow?: BTCNetworkFee
}
