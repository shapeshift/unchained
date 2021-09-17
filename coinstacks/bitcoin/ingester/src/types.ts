import { BlockDocument } from '@shapeshiftoss/common-mongo'

// https://developer.bitcoin.org/reference/rpc/getblock.html
export interface BTCBlock {
  hash: string
  confirmations: number
  size: number
  strippedsize: number
  weight: number
  height: number
  version: number
  versionHex: string
  merkleroot: string
  tx: Array<string> /// todo
  time: number
  mediantime: number
  nonce: number
  bits: string
  difficulty: number
  chainwork: string
  nTx: number
  previousblockhash: string
  nextblockhash: string
}

// export interface BTCBlock {
//   page: number
//   totalPages: number
//   itemsOnPage: number
//   hash: string
//   previousblockhash: string
//   nextblockhash: string
//   height: number
//   confirmations: number
//   size: number
//   time: number
//   version: number
//   merkleroot: string
//   nonce: string
//   bits: string
//   difficulty: number
//   txCount: number
//   txs: Array<string>
// }

export interface ReorgResult {
  dbBlock: BlockDocument
  height: number
  nodeBlock: BTCBlock
}

export type TxHistory = Array<string>
