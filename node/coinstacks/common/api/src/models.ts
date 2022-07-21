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
 * Contains info about base account details for an address or xpub
 */
export interface BaseAccount {
  balance: string
  unconfirmedBalance: string
  pubkey: string
}

/**
 * Contains info about the running coinstack
 */
export interface BaseInfo {
  network: string
}

/**
 * Contains info for pagination
 */
export interface Pagination {
  cursor?: string
}

/**
 * Contains the serialized raw transaction hex
 */
export interface SendTxBody {
  hex: string
}

/**
 * Contains info about base transaction details
 */
export interface BaseTx {
  txid: string
  blockHash?: string
  blockHeight: number
  timestamp: number
}

/**
 * Contains paginated base transaction history details
 */
export interface BaseTxHistory<T = BaseTx> extends Pagination {
  pubkey: string
  txs: Array<T>
}
