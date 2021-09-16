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
  nonce: string
  bits: string
  difficulty: number
  chainwork: string
  nTx: number
  previousblockhash: string
  nextblockhash: string
}
export interface ReorgResult {
  dbBlock: BlockDocument
  height: number
  nodeBlock: BTCBlock
}

export type TxHistory = Array<string>
