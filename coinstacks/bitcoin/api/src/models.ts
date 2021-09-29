/* unable to import models from a module with tsoa */
import { Account } from '../../../common/api/src'

/**
 * Contains info about a transactions ScriptSig
 */
export type ScriptSig = {
  asm: string
  hex: string
}

/**
 * Contains info about a transactions ScriptPubKey
 */
export type ScriptPubKey = {
  asm: string
  hex: string
  reqSigs: number
  type: string
  addresses: string[]
}

/**
 * Contains info about a transactions inputs
 */
export type Vin = {
  txid?: string
  vout?: number
  sequence?: number
  n?: number
  addresses?: Array<string>
  isAddress?: boolean
  value?: string
  hex?: string
  asm?: string
  coinbase?: string
  scriptSig?: ScriptSig
}

/**
 * Contains info about a transactions outputs
 */
export type Vout = {
  value?: string
  n: number
  spent?: boolean
  spentTxId?: string
  spentIndex?: number
  spentHeight?: number
  hex?: string
  asm?: string
  addresses: Array<string> | null
  isAddress: boolean
  type?: string
  scriptPubKey?: ScriptPubKey
}

/**
 * Contains detailed info about a Bitcoin transaction
 */
export type BitcoinTxSpecific = {
  txid: string
  hash?: string
  version?: number
  size?: number
  vsize?: number
  weight?: number
  locktime?: number
  vin: Array<Vin>
  vout: Array<Vout>
  hex?: string
  blockhash?: string
  confirmations: number
  time?: number
  blocktime?: number
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
 * Contains additional bitcoin specific info
 */
export interface BitcoinAccount extends Account {
  /**
   * List of associated addresses for an xpub
   */
  addresses?: Array<Account>

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
}
