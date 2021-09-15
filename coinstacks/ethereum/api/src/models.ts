/* unable to import models from a module with tsoa */
import { Balance } from '../../../common/api/src'

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

export interface EthereumBalance extends Balance {
  tokens: Token[]
  nonce?: string
}
