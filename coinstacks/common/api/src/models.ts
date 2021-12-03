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
 * Contains info about account details for an address or xpub
 */
export interface Account {
  balance: string
  caip2: string
  pubkey: string
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
export interface SendTxBody {
  hex: string
}

/**
 * Contains info about a transaction
 */
export interface Tx {
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
