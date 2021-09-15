/**
 * Contains Account information
 */
export interface Account {
  network: string
  symbol: string
  pubKey: string
  balance: string
  unconfirmedBalance: string
  unconfirmedTxs: number
  txs: number
  tokens?: Token[]
  bitcoin?: BitcoinAccountSpecific
  ethereum?: EthereumAccountSpecific
}

/**
 * Contains Account information
 */
export interface BitcoinAccountSpecific {
  utxos: number
  receiveIndex: number
  changeIndex: number
}

/**
 * Contains ethereum specific transaction data
 */
export interface EthereumAccountSpecific {
  nonce: number
}

/**
 * Contains info about a 400 Bad Request response
 */
export interface BadRequestError {
  error: string
}

/**
 * Contains info about a 404 Not Found response
 */
export interface NotFoundError {
  message: string
}

/**
 * Contains info about a 422 Validation Error response
 */
export interface ValidationError {
  message: 'Validation failed'
  details: { [name: string]: unknown }
}

/**
 * Contains info about a 500 Internal Server Error response
 */
export interface InternalServerError {
  message: string
}

/**
 * Contains token info from a given address
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
 * Contains info about an addresses balance
 */
export interface Balance {
  network: string
  symbol: string
  address: string
  balance: string
  totalReceived?: string
  totalSent?: string
  unconfirmedBalance: string
  unconfirmedTxs: number
  txs: number
  tokens?: Token[]
}

/**
 * Contains info about a balance change
 */
export interface BalanceChange {
  timestamp: number
  amount: string
}

/**
 * Contains info about a block
 */
export interface Block {
  network: string
  hash: string
  prevHash?: string
  nextHash?: string
  height: number
  confirmations: number
  timestamp?: number
  txs: number
}

/**
 * Contains ethereum specific transaction data
 */
export interface EthereumTxSpecific {
  status: number
  nonce: number
  gasLimit: number
  gasUsed: number
  gasPrice: string
  data?: string
}

/**
 * Contains info for pagination
 */
export interface Pagination {
  page: number
  totalPages: number
}

/**
 * Contains the serialized raw transaction hex
 */
export interface RawTx {
  hex: string
}

/**
 * Contains info about a token transfer done in a transaction
 */
export interface TokenTransfer {
  type: string
  from: string
  to: string
  token: string
  name: string
  symbol: string
  decimals: number
  value: string
}

/**
 * Contains info about a transaction
 */
export interface Tx {
  network: string
  symbol: string
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
 * Contains paginated transaction history
 */
export interface TxHistory extends Pagination {
  txs: number
  transactions: Array<Tx>
}

/**
 * Contains info about a successfully sent transaction
 */
export interface TxReceipt {
  network: string
  txid: string
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

/**
 * Contains info about single transaction input
 */
export interface Vin {
  txid?: string
  vout?: number
  sequence?: number
  n: number
  addresses?: Array<string>
  isAddress: boolean
  value?: string
  hex?: string
  asm?: string
  coinbase?: string
}

/**
 * Contains info about single transaction output
 */
export interface Vout {
  value?: string
  n: number
  spent?: boolean
  spentTxId?: string
  spentIndex?: number
  spentHeight?: number
  hex?: string
  asm?: string
  addresses: Array<string>
  isAddress: boolean
  type?: string
}

/**
 * Contains info about a Bitcoin Public Key
 */
export interface Xpub {
  page: number
  totalPages: number
  itemsOnPage: number
  address: string
  balance: string
  totalReceived: string
  totalSent: string
  unconfirmedBalance: string
  unconfirmedTxs: number
  txs: number
  txids: string[]
  usedTokens: number
}
