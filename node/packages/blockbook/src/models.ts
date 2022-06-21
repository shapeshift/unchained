import axios, { AxiosError } from 'axios'

/**
 * Generic api error for handling failed requests
 */
export class ApiError extends AxiosError {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(err: AxiosError<any> | Error) {
    if (axios.isAxiosError(err)) {
      super(err.response?.data?.error ?? JSON.stringify(err.response?.data) ?? err.message)
    } else {
      super(err.message)
    }

    Object.assign(this, err, { message: this.message })
  }
}

/**
 * Contains info about an address and it's transactions
 */
export interface Address extends Paging {
  address: string
  balance: string
  totalReceived?: string
  totalSent?: string
  unconfirmedBalance: string
  unconfirmedTxs: number
  txs: number
  nonTokenTxs?: number
  transactions?: Array<Tx>
  txids?: Array<string>
  nonce?: string
  usedTokens?: number
  tokens?: Array<Token>
  erc20Contract?: Erc20Contract
}

/**
 * Contains info about backend node
 */
export interface BackendInfo {
  error?: string
  chain?: string
  blocks?: number
  headers?: number
  bestBlockHash?: string
  difficulty?: string
  sizeOnDisk?: number
  version?: string
  subversion?: string
  protocolVersion?: string
  timeOffset?: number
  warnings?: string
  consensus?: unknown
}

/**
 * Contains info about one point in time of balance history
 */
export interface BalanceHistory {
  time: number
  txs: number
  received: string
  sent: string
  sentToSelf: string
  rates?: { [key: string]: number }
  txid?: string
}

/**
 * Contains info about a block
 */
export interface Block extends Paging {
  hash: string
  previousBlockHash?: string
  nextBlockHash?: string
  height: number
  confirmations: number
  size: number
  time?: number
  version: number
  merkleRoot: string
  nonce: string
  bits: string
  difficulty: string
  txCount: number
  tx?: Array<string>
  txs?: Array<Tx>
}

/**
 * Contains info about blockbook
 */
interface BlockbookInfo {
  coin: string
  host: string
  version: string
  gitCommit: string
  buildTime: string
  syncMode: boolean
  initialSync: boolean
  inSync: boolean
  bestHeight: number
  lastBlockTime: string
  inSyncMempool: boolean
  lastMempoolTime: string
  mempoolSize: number
  decimals: number
  dbSize: number
  dbSizeFromColumns?: number
  dbColumns?: Array<unknown>
  about: string
}

/**
 * Contains block hash
 */
export interface BlockIndex {
  hash: string
}

/**
 * Contains info about blockbook and connected backend node
 */
export interface Info {
  blockbook: BlockbookInfo
  backend: BackendInfo
}

/**
 * Contains ethereum specific transaction data
 */
export interface EthereumSpecific {
  status: number
  nonce: number
  gasLimit: number
  gasUsed: number | null
  gasPrice: string
  data?: string
}

/**
 * Contains info about an ERC20 contract
 */
export interface Erc20Contract {
  contract: string
  name: string
  symbol: string
  decimals: number
}

/**
 * Contains info about paging for address, xpub, and block
 */
export interface Paging {
  page?: number
  totalPages?: number
  itemsOnPage?: number
}

/**
 * Contains transaction id result
 */
export interface SendTx {
  result: string
}

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
  txid: string
  version?: number
  lockTime?: number
  vin: Array<Vin>
  vout: Array<Vout>
  blockHash?: string
  blockHeight: number
  confirmations: number
  blockTime: number
  size?: number
  value: string
  valueIn?: string
  fees?: string
  hex?: string
  rbf?: boolean
  tokenTransfers?: Array<TokenTransfer>
  coinSpecificData?: unknown
  ethereumSpecific?: EthereumSpecific
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
  addresses: Array<string> | null // null value for contract creation transaction
  isAddress: boolean
  type?: string
}

/**
 * Contains info about an xpub and it's transactions
 */
export type Xpub = Address

/**
 * Contains info about current network fees
 */
export interface NetworkFee {
  feePerTx?: string
  feePerUnit?: string
  feeLimit?: string
}

/**
 * Response data for fees endpoint on websocket API
 */
export interface FeeResponse {
  id: number
  data: NetworkFee[]
}

/**
 * Arguments to Blockbook constructor
 */
export interface BlockbookArgs {
  httpURL: string
  wsURL: string
}
