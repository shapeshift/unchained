import { BlockDocument } from '@shapeshiftoss/common-mongo'
import { Tx } from '@shapeshiftoss/blockbook'
import { ParseTx, SequencedData } from '@shapeshiftoss/common-ingester'

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
  tx: Array<string>
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

export type BTCParseTx = Tx & ParseTx
export type SequencedBTCParseTx = BTCParseTx & SequencedData

export interface ReorgResult {
  dbBlock: BlockDocument
  height: number
  nodeBlock: BTCBlock
}

export type TxHistory = Array<string>
